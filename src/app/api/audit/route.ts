import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractText } from '@/lib/document-extractor';
import { runMultiPassAudit } from '@/lib/multi-pass-engine';
import { clientIpFrom, rateLimit } from '@/lib/rate-limit';
import { supabaseService } from '@/lib/supabase';
import { hashDocument, wipeBuffer } from '@/lib/zero-knowledge';
import type { FrameworkId } from '@/lib/legal-frameworks';

/**
 * Cost protection. Tighter on IP (anonymous abuse) than on org (paying
 * customer). Production should swap the in-memory store for Redis.
 */
const IP_LIMIT  = { windowMs: 60 * 60 * 1000, max: 5  };  //  5/h per IP
const ORG_LIMIT = { windowMs: 24 * 60 * 60 * 1000, max: 50 }; // 50/day per org

/**
 * Audit creation endpoint.
 *
 * We run on the Node.js runtime (not Edge) because:
 *   • the legal pass can take 30-60s on large documents and Edge has a 25s
 *     hard limit on Vercel;
 *   • we need `Buffer` to wipe the document bytes deterministically.
 *
 * The handler accepts multipart/form-data so the file never round-trips
 * through a JSON-encoded base64 (which would double its memory footprint).
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

const Meta = z.object({
  organizationId: z.string().uuid(),
  frameworks: z.string().transform((s) => s.split(',') as FrameworkId[]),
  targetLanguage: z.string().min(2).max(10)
});

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get('document');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'document_required' }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'document_too_large' }, { status: 413 });
  }

  let meta: z.infer<typeof Meta>;
  try {
    meta = Meta.parse({
      organizationId: form.get('organizationId'),
      frameworks: form.get('frameworks'),
      targetLanguage: form.get('targetLanguage')
    });
  } catch (err) {
    return NextResponse.json({ error: 'invalid_metadata', detail: String(err) }, { status: 400 });
  }

  // Rate limit: cheap-fail before we spend AI credits.
  const ip = clientIpFrom(request.headers);
  const ipLimit  = rateLimit({ key: `audit:ip:${ip}`,                ...IP_LIMIT });
  const orgLimit = rateLimit({ key: `audit:org:${meta.organizationId}`, ...ORG_LIMIT });
  if (!ipLimit.ok || !orgLimit.ok) {
    const offender = !ipLimit.ok ? ipLimit : orgLimit;
    return NextResponse.json(
      { error: 'rate_limited', resetAt: offender.resetAt },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((offender.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Reset': String(Math.floor(offender.resetAt / 1000))
        }
      }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file instanceof File ? file.name : undefined;
  const mime = file.type || undefined;

  let report;
  try {
    // 1. Extract text (PDF/DOCX/MD/TXT) — server-only, sensitive.
    const extracted = await extractText(buffer, { filename, mime });
    // 2. Run Multi-Pass over the extracted text.
    report = await runMultiPassAudit({
      documentText: extracted.text,
      frameworks: meta.frameworks,
      targetLanguage: meta.targetLanguage
    });
    // Override hash from raw bytes (covers identical text from different
    // file formats — same hash, same audit, deduped).
    report.documentHash = hashDocument(extracted.text);
  } catch (err) {
    return NextResponse.json(
      { error: 'extraction_or_audit_failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 422 }
    );
  } finally {
    // Zero-Knowledge: wipe raw bytes whatever the path (success/failure).
    wipeBuffer(buffer);
  }

  // Persist only the AI-authored report (no document body, no PII).
  const db = supabaseService();
  const { data: audit, error } = await db
    .from('audits')
    .insert({
      organization_id: meta.organizationId,
      document_hash: report.documentHash,
      frameworks: report.frameworks,
      status: 'completed',
      risk_score: report.riskScore,
      summary: report.summary,
      language: report.language,
      completed_at: report.generatedAt
    })
    .select('id')
    .single();

  if (error || !audit) {
    console.error('[audit] persistence_failed:', {
      organizationId: meta.organizationId,
      supabaseError: error
        ? { code: error.code, message: error.message, details: error.details, hint: error.hint }
        : 'no row returned'
    });
    return NextResponse.json(
      { error: 'persistence_failed', detail: error?.message ?? 'no row' },
      { status: 500 }
    );
  }

  if (report.findings.length > 0) {
    await db.from('audit_findings').insert(
      report.findings.map((f) => ({
        audit_id: audit.id,
        framework_id: f.framework,
        citation: f.citation,
        severity: f.severity,
        title: f.title,
        body: f.body,
        recommendation: f.recommendation,
        evidence: f.evidence
      }))
    );
  }

  return NextResponse.json({ auditId: audit.id, report });
}
