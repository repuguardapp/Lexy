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

  const db = supabaseService();

  // Credit gate. The SQL function is atomic, so two concurrent
  // submissions on the same org with `credits_remaining = 1` cannot
  // both succeed — exactly one will get the row, the other gets a 402.
  // Anonymous-org runs bypass this server-side (see migration 0007).
  const { data: consumed, error: creditErr } = await db.rpc('try_consume_audit_credit', {
    p_org_id: meta.organizationId
  });
  if (creditErr) {
    console.error('[audit/async] credit_check_failed:', creditErr);
    return NextResponse.json(
      { error: 'credit_check_failed', detail: creditErr.message },
      { status: 500 }
    );
  }
  if (!consumed) {
    return NextResponse.json(
      { error: 'no_credits', redirect: '/pricing' },
      { status: 402 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file instanceof File ? file.name : undefined;
  const mime = file.type || undefined;

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
    // We already debited a credit before the insert; the customer must
    // not lose it for an internal failure. The function is a no-op for
    // the anonymous org so this is safe to call unconditionally.
    const { error: refundErr } = await db.rpc('refund_audit_credit', {
      p_org_id: meta.organizationId
    });
    if (refundErr) {
      console.error('[audit/async] refund_failed_after_insert_error:', refundErr);
    }
    return NextResponse.json(
      { error: 'persistence_failed', detail: error?.message ?? 'no row' },
      { status: 500 }
    );
  }

  // Background work — waitUntil keeps the function instance alive on Vercel
  // until the promise resolves, even after we send the 202 response.
  waitUntil(
    (async () => {
      const log = (step: string, extra: Record<string, unknown> = {}) =>
        console.log('[audit/async]', JSON.stringify({ step, auditId: pending.id, ...extra }));

      try {
        log('background_started');
        const { error: runningErr, count: runningCount } = await db
          .from('audits')
          .update({ status: 'running' }, { count: 'exact' })
          .eq('id', pending.id);
        log('status_running_written', { affected: runningCount, error: runningErr?.message });

        log('extract_start');
        const extracted = await extractText(buffer, { filename, mime });
        log('extract_done', { type: extracted.type, charCount: extracted.charCount, redactionCount: extracted.redactionCount });

        log('multipass_start', { frameworks: meta.frameworks, lang: meta.targetLanguage });
        const report = await runMultiPassAudit({
          documentText: extracted.text,
          frameworks: meta.frameworks,
          targetLanguage: meta.targetLanguage
        });
        report.documentHash = hashDocument(extracted.text);
        log('multipass_done', { findings: report.findings.length, riskScore: report.riskScore });

        log('completed_update_start');
        const { error: updateErr, count: updateCount } = await db
          .from('audits')
          .update(
            {
              status: 'completed',
              document_hash: report.documentHash,
              risk_score: report.riskScore,
              summary: report.summary,
              completed_at: report.generatedAt
            },
            { count: 'exact' }
          )
          .eq('id', pending.id);
        if (updateErr) {
          log('completed_update_failed', { error: updateErr.message, code: updateErr.code });
          throw new Error(`audit_complete_update_failed: ${updateErr.message}`);
        }
        // affected=0 here means the row vanished between insert and update — the
        // service_role bypasses RLS so there is no policy in the way. If we ever
        // see this, the cron purge or a manual delete fired mid-flight.
        if (updateCount === 0) {
          log('completed_update_zero_rows');
          throw new Error('audit_complete_update_zero_rows');
        }
        log('completed_update_done', { affected: updateCount });

        if (report.findings.length > 0) {
          log('findings_insert_start', { count: report.findings.length });
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
            log('findings_insert_failed', { error: findingsErr.message });
          } else {
            log('findings_insert_done');
          }
        }

        // Best-effort completion notification — failures are silent.
        log('email_dispatch');
        void sendAuditCompletedEmail({
          organizationId: meta.organizationId,
          auditId: pending.id,
          riskScore: report.riskScore,
          findingsCount: report.findings.length
        });
        log('background_done');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log('background_threw', { error: message });
        await db
          .from('audits')
          .update({ status: 'failed', error_message: message })
          .eq('id', pending.id);
        log('failed_status_written');
        // Refund the credit — a failed audit (timeout, malformed model
        // output, persistence error) shouldn't cost the customer. The
        // SQL function is a no-op for the anonymous org.
        const { error: refundErr } = await db.rpc('refund_audit_credit', {
          p_org_id: meta.organizationId
        });
        if (refundErr) {
          log('refund_failed', { error: refundErr.message });
        }
      } finally {
        wipeBuffer(buffer);
        log('buffer_wiped');
      }
    })()
  );

  return NextResponse.json({ auditId: pending.id, status: 'pending' }, { status: 202 });
}
