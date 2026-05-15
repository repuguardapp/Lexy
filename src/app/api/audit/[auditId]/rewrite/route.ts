import { NextResponse } from 'next/server';
import { z } from 'zod';
import { anthropic, ANTHROPIC_MODEL } from '@/lib/ai-clients';
import { clientIpFrom, rateLimit } from '@/lib/rate-limit';
import { supabaseService } from '@/lib/supabase';
import { getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';

/**
 * Per-finding AI rewrite endpoint.
 *
 * Contract:
 *   - The caller posts { findingId, documentText, targetLanguage }.
 *   - We look up the finding to get its title, body, recommendation,
 *     and evidence span — the *server* owns the canonical text of the
 *     finding so a malicious client can't smuggle a different prompt
 *     into the rewrite call.
 *   - We ask Claude to (a) identify the offending segment in the
 *     supplied document text and (b) return a rewritten replacement
 *     plus the original segment we asked it to substitute. The client
 *     does the in-textarea swap.
 *   - The document text is NEVER persisted. Zero-Knowledge is
 *     preserved end-to-end: the bytes only exist in the request body
 *     for the duration of the Anthropic call.
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
  documentText: z.string().min(1).max(200_000),
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
  { params }: { params: { auditId: string } }
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
    .eq('id', params.auditId)
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
    .eq('audit_id', params.auditId)
    .maybeSingle();
  if (findingErr || !findingRaw) {
    return NextResponse.json({ error: 'finding_not_found' }, { status: 404 });
  }
  const finding = findingRaw as FindingRow;

  // Single Sonnet call. Asks for strict JSON so we can parse the two
  // fields the client needs — the original segment to swap and the
  // suggested replacement — without leaving the LLM room to wrap the
  // answer in prose.
  const system = [
    'You are a senior compliance counsel rewriting policy and contract clauses.',
    'You receive a flagged compliance finding plus the full source document.',
    'Locate the offending clause in the document and produce a tighter, fully compliant replacement.',
    'Respond with STRICT JSON only — no prose, no markdown fences — matching:',
    '{"segment": "<verbatim text from the source document>", "rewrite": "<the corrected clause>"}',
    'Constraints:',
    '- The `segment` MUST be a verbatim substring of the document (so the client can find-and-replace it).',
    '- The `rewrite` MUST be in the same language as the rest of the document, unless `targetLanguage` differs from the document language — in which case write the rewrite in `targetLanguage`.',
    '- Keep tone, formality and length proportionate to the surrounding clause.',
    '- Resolve the finding without introducing new obligations the document did not already cover.'
  ].join('\n');

  const user = [
    `Finding (severity: ${finding.severity}, framework: ${finding.framework_id}):`,
    `Title: ${finding.title}`,
    `Body: ${finding.body}`,
    `Recommendation: ${finding.recommendation}`,
    `Evidence quote (from the original audit pass): "${finding.evidence}"`,
    '',
    `Target language for the rewrite: ${payload.targetLanguage}`,
    '',
    'Document:',
    payload.documentText
  ].join('\n');

  let rawText: string;
  try {
    const completion = await anthropic().messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }]
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
  // ("```json\n{...}\n```") despite the system prompt. Strip the
  // fences before parsing.
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

  let parsed: { segment?: unknown; rewrite?: unknown };
  try {
    parsed = JSON.parse(cleaned) as { segment?: unknown; rewrite?: unknown };
  } catch {
    return NextResponse.json({ error: 'rewrite_unparseable', detail: rawText.slice(0, 200) }, { status: 502 });
  }

  const segment = typeof parsed.segment === 'string' ? parsed.segment : undefined;
  const rewrite = typeof parsed.rewrite === 'string' ? parsed.rewrite : undefined;
  if (!rewrite) {
    return NextResponse.json({ error: 'rewrite_empty' }, { status: 502 });
  }

  return NextResponse.json({ rewrite, segment });
}
