import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runMultiPassAudit } from '@/lib/multi-pass-engine';
import { supabaseService } from '@/lib/supabase';
import { withEphemeralDocument } from '@/lib/zero-knowledge';
import type { FrameworkId } from '@/lib/legal-frameworks';

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

  const buffer = Buffer.from(await file.arrayBuffer());

  // Multi-Pass + Zero-Knowledge: extract text, hash, audit, wipe.
  const report = await withEphemeralDocument(buffer, async (text) => {
    return runMultiPassAudit({
      documentText: text,
      frameworks: meta.frameworks,
      targetLanguage: meta.targetLanguage
    });
  });

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
    return NextResponse.json({ error: 'persistence_failed', detail: error?.message }, { status: 500 });
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
