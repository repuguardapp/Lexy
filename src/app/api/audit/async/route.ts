import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { extractText } from '@/lib/document-extractor';
import { sendAuditCompletedEmail } from '@/lib/email';
import { runMultiPassAudit } from '@/lib/multi-pass-engine';
import { clientIpFrom, rateLimit } from '@/lib/rate-limit';
import { supabaseService } from '@/lib/supabase';
import { hashDocument, wipeBuffer } from '@/lib/zero-knowledge';
import type { FrameworkId } from '@/lib/legal-frameworks';

const IP_LIMIT  = { windowMs: 60 * 60 * 1000, max: 5  };
const ORG_LIMIT = { windowMs: 24 * 60 * 60 * 1000, max: 50 };

/**
 * Asynchronous audit endpoint.
 *
 * Accepts the upload, returns 202 with a pending audit id immediately,
 * and runs the Multi-Pass pipeline as a background task — kept alive on
 * Vercel by `waitUntil()`. The client polls `/api/audit/[id]` for
 * completion.
 *
 * Why waitUntil and not `void (async () => {})()`: a bare fire-and-forget
 * after the response is sent gets killed by Vercel's serverless runtime
 * the moment the response is flushed; the background work never runs and
 * the audit row stays at status='pending' forever. waitUntil tells the
 * runtime to keep the instance alive until the promise resolves.
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

  const meta = Meta.parse({
    organizationId: form.get('organizationId'),
    frameworks: form.get('frameworks'),
    targetLanguage: form.get('targetLanguage')
  });

  const ip = clientIpFrom(request.headers);
  const ipLimit  = rateLimit({ key: `audit:ip:${ip}`,                ...IP_LIMIT });
  const orgLimit = rateLimit({ key: `audit:org:${meta.organizationId}`, ...ORG_LIMIT });
  if (!ipLimit.ok || !orgLimit.ok) {
    const offender = !ipLimit.ok ? ipLimit : orgLimit;
    return NextResponse.json(
      { error: 'rate_limited', resetAt: offender.resetAt },
      { status: 429 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file instanceof File ? file.name : undefined;
  const mime = file.type || undefined;
  const db = supabaseService();

  // Unique per-attempt placeholder so retries do not collide on the
  // (organization_id, document_hash, language) unique index. Replaced
  // by the real sha256 once the Multi-Pass engine has extracted text.
  const placeholderHash = `pending:${randomUUID()}`;

  const { data: pending, error } = await db
    .from('audits')
    .insert({
      organization_id: meta.organizationId,
      document_hash: placeholderHash,
      frameworks: meta.frameworks,
      status: 'pending',
      language: meta.targetLanguage
    })
    .select('id')
    .single();

  if (error || !pending) {
    // Surface the underlying Supabase error in Vercel logs so we can
    // diagnose persistence failures without re-running the audit.
    console.error('[audit/async] persistence_failed:', {
      organizationId: meta.organizationId,
      frameworks: meta.frameworks,
      supabaseError: error
        ? { code: error.code, message: error.message, details: error.details, hint: error.hint }
        : 'no row returned'
    });
    return NextResponse.json(
      { error: 'persistence_failed', detail: error?.message ?? 'no row' },
      { status: 500 }
    );
  }

  // Background work — waitUntil keeps the function instance alive on Vercel
  // until the promise resolves, even after we send the 202 response.
  waitUntil(
    (async () => {
      try {
        await db.from('audits').update({ status: 'running' }).eq('id', pending.id);

        const extracted = await extractText(buffer, { filename, mime });
        const report = await runMultiPassAudit({
          documentText: extracted.text,
          frameworks: meta.frameworks,
          targetLanguage: meta.targetLanguage
        });
        report.documentHash = hashDocument(extracted.text);

        const { error: updateErr } = await db
          .from('audits')
          .update({
            status: 'completed',
            document_hash: report.documentHash,
            risk_score: report.riskScore,
            summary: report.summary,
            completed_at: report.generatedAt
          })
          .eq('id', pending.id);
        if (updateErr) {
          console.error('[audit/async] complete update failed:', updateErr);
          throw new Error(`audit_complete_update_failed: ${updateErr.message}`);
        }

        if (report.findings.length > 0) {
          const { error: findingsErr } = await db.from('audit_findings').insert(
            report.findings.map((f) => ({
              audit_id: pending.id,
              framework_id: f.framework,
              citation: f.citation,
              severity: f.severity,
              title: f.title,
              body: f.body,
              recommendation: f.recommendation,
              evidence: f.evidence
            }))
          );
          if (findingsErr) {
            console.error('[audit/async] findings insert failed:', findingsErr);
          }
        }

        // Best-effort completion notification — failures are silent.
        void sendAuditCompletedEmail({
          organizationId: meta.organizationId,
          auditId: pending.id,
          riskScore: report.riskScore,
          findingsCount: report.findings.length
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[audit/async] background task failed:', { auditId: pending.id, error: message });
        await db
          .from('audits')
          .update({ status: 'failed', error_message: message })
          .eq('id', pending.id);
      } finally {
        wipeBuffer(buffer);
      }
    })()
  );

  return NextResponse.json({ auditId: pending.id, status: 'pending' }, { status: 202 });
}
