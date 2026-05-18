import { NextResponse } from 'next/server';
import { z } from 'zod';
import { anthropic, ANTHROPIC_MODEL } from '@/lib/ai-clients';
import { clientIpFrom, rateLimit } from '@/lib/rate-limit';
import { supabaseService } from '@/lib/supabase';
import { getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';

/**
 * Per-finding AI clause-rewrite endpoint.
 *
 * Architectural choice: the client posts ONLY a finding id (and the
 * target language). The server reads the canonical offending clause
 * (`finding.evidence`) and the violated rule (`finding.title`,
 * `finding.body`, `finding.recommendation`) from Postgres. The
 * document text is NOT sent over the wire — Claude rewrites the
 * clause in isolation against the rule.
 *
 * Why server-canonical:
 *   1. Cost / latency. The evidence quote is 1–3 sentences vs the
 *      whole document (can be 200 KB). Token usage drops ~99 %.
 *   2. Privacy. The rest of the document never leaves the database
 *      to call this endpoint.
 *   3. Tamper resistance. A malicious client cannot smuggle a
 *      different rule or clause into the prompt — both come from
 *      the persisted audit_findings row.
 *   4. Determinism. The original segment we ship back is byte-for-
 *      byte the evidence string, so the client's find-and-replace
 *      can never miss (or duplicate) the swap target.
 *
 * Response shape (strict, JSON-only):
 *   { segment_original: string, segment_corrige: string }
 *
 * Authentication:
 *   - The audit row's organization_id must match the caller's org,
 *     OR the audit was produced by the anonymous-org placeholder
 *     (public-by-UUID share-link style — see audit detail page).
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

const ANONYMOUS_ORG_ID = '00000000-0000-0000-0000-000000000000';
const IP_LIMIT = { windowMs: 60 * 60 * 1000, max: 30 }; // 30/h per IP

const Body = z.object({
  findingId: z.string().uuid(),
  targetLanguage: z.string().min(2).max(10)
});

interface FindingRow {
  id: string;
  audit_id: string;
  framework_id: string;
  title: string;
  body: string;
  recommendation: string;
  evidence: string;
  severity: string;
}

interface AuditRow {
  id: string;
  organization_id: string;
  language: string;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const ip = clientIpFrom(request.headers);
  const limit = rateLimit({ key: `rewrite:ip:${ip}`, ...IP_LIMIT });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited', resetAt: limit.resetAt },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
    );
  }

  let payload: z.infer<typeof Body>;
  try {
    payload = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_request', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  const db = supabaseService();

  const { data: auditRaw, error: auditErr } = await db
    .from('audits')
    .select('id,organization_id,language')
    .eq('id', params.id)
    .maybeSingle();
  if (auditErr || !auditRaw) {
    return NextResponse.json({ error: 'audit_not_found' }, { status: 404 });
  }
  const audit = auditRaw as AuditRow;

  // Ownership: anonymous-org audits are public-by-UUID; everything
  // else requires a logged-in user whose org matches the audit.
  if (audit.organization_id !== ANONYMOUS_ORG_ID) {
    const user = await getCurrentUser();
    if (!user || organizationIdFromUser(user) !== audit.organization_id) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const { data: findingRaw, error: findingErr } = await db
    .from('audit_findings')
    .select('id,audit_id,framework_id,title,body,recommendation,evidence,severity')
    .eq('id', payload.findingId)
    .eq('audit_id', params.id)
    .maybeSingle();
  if (findingErr || !findingRaw) {
    return NextResponse.json({ error: 'finding_not_found' }, { status: 404 });
  }
  const finding = findingRaw as FindingRow;

  // Empty evidence means the Multi-Pass pass-1 did not anchor this
  // finding to a verbatim quote — there is nothing to find-and-replace
  // in the document. Surface a distinct error so the UI can guide the
  // user to apply the recommendation manually.
  if (!finding.evidence || finding.evidence.trim().length === 0) {
    return NextResponse.json({ error: 'no_evidence_anchor' }, { status: 422 });
  }

  // Strict-JSON Sonnet call. We send ONLY the offending clause and the
  // rule that flagged it — never the rest of the document. The hard
  // constraints below are the difference between a usable corporate
  // tool and a hallucination machine.
  const system = [
    'You are a senior compliance counsel rewriting a single offending clause from a policy or contract.',
    'You receive (a) the verbatim clause that was flagged by an automated compliance audit, and',
    '(b) the compliance rule it violates (regulation citation, finding title, finding body, recommendation).',
    '',
    'Respond with STRICT JSON ONLY — no prose, no markdown fences, no commentary — matching:',
    '{"segment_original": "<verbatim clause as received>", "segment_corrige": "<corrected clause>"}',
    '',
    'Hard constraints:',
    '- `segment_original` MUST be byte-for-byte identical to the clause you received. Do not normalize whitespace, do not paraphrase.',
    '- `segment_corrige` MUST resolve the compliance finding while preserving the legal tone, register, and structure of the original clause.',
    '- DO NOT invent facts, names, addresses, phone numbers, emails, URLs, dates, or amounts that were not in the original clause or the recommendation.',
    '- DO NOT introduce obligations the original document did not already cover. If the rule requires disclosing a Data Protection Officer, write a clause that REQUIRES disclosing one — do not fabricate a fictional officer.',
    '- Write the rewrite in the requested target language.',
    '- For RTL targets (Arabic, Hebrew, Persian, Urdu): use Modern Standard register, keep numerals in Latin digits (1, 2, 3) so article numbers stay legible inside an RTL paragraph, and emit no Unicode bidi control characters.',
    '- Keep the length of `segment_corrige` proportionate to `segment_original` — typically within 3× the original word count.'
  ].join('\n');

  const userPrompt = [
    `Target language: ${payload.targetLanguage}`,
    '',
    'Compliance rule violated:',
    `  Framework: ${finding.framework_id}`,
    `  Severity:  ${finding.severity}`,
    `  Title:     ${finding.title}`,
    `  Body:      ${finding.body}`,
    `  Recommended remediation: ${finding.recommendation}`,
    '',
    'Offending clause (verbatim — this is the segment_original you must echo back):',
    finding.evidence
  ].join('\n');

  let rawText: string;
  try {
    const completion = await anthropic().messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: userPrompt }]
    });
    const block = completion.content[0];
    if (!block || block.type !== 'text') {
      return NextResponse.json({ error: 'rewrite_no_text' }, { status: 502 });
    }
    rawText = block.text;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'anthropic_error', detail }, { status: 502 });
  }

  // Anthropic occasionally wraps strict-JSON outputs in a fenced block
  // ("```json\n{...}\n```") despite the system prompt. Strip fences
  // before parsing.
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

  let parsed: { segment_original?: unknown; segment_corrige?: unknown };
  try {
    parsed = JSON.parse(cleaned) as { segment_original?: unknown; segment_corrige?: unknown };
  } catch {
    return NextResponse.json({ error: 'rewrite_unparseable', detail: rawText.slice(0, 200) }, { status: 502 });
  }

  const segmentCorrige =
    typeof parsed.segment_corrige === 'string' ? parsed.segment_corrige : undefined;
  if (!segmentCorrige) {
    return NextResponse.json({ error: 'rewrite_empty' }, { status: 502 });
  }

  // We trust the server-side evidence for the swap target, not what
  // the model echoed back — guards against models that drift on the
  // "byte-for-byte" instruction. The client uses segment_original to
  // locate the clause in the editor textarea.
  return NextResponse.json({
    segment_original: finding.evidence,
    segment_corrige: segmentCorrige
  });
}
