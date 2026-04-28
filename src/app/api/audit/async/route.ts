import { NextResponse } from 'next/server';
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
 * For documents close to or over the synchronous 25 MB limit we accept the
 * upload, immediately return a `pending` audit row, and run the Multi-Pass
 * pipeline as a fire-and-forget background task. The client polls
 * `/api/audit/[id]` for completion. This pattern survives serverless
 * timeouts because the Function lifetime stays bounded by the response.
 *
 * Note: in a stricter deployment we would dispatch to a queue (QStash,
 * SQS, Supabase pg_cron). The inline pattern is sufficient for the MVP.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

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

  const { data: pending, error } = await db
    .from('audits')
    .insert({
      organization_id: meta.organizationId,
      document_hash: 'pending',
      frameworks: meta.frameworks,
      status: 'pending',
      language: meta.targetLanguage
    })
    .select('id')
    .single();

  if (error || !pending) {
    return NextResponse.json({ error: 'persistence_failed' }, { status: 500 });
  }

  // Fire-and-forget; client polls /api/audit/[id].
  void (async () => {
    try {
      await db.from('audits').update({ status: 'running' }).eq('id', pending.id);

      const extracted = await extractText(buffer, { filename, mime });
      const report = await runMultiPassAudit({
        documentText: extracted.text,
        frameworks: meta.frameworks,
        targetLanguage: meta.targetLanguage
      });
      report.documentHash = hashDocument(extracted.text);

      await db
        .from('audits')
        .update({
          status: 'completed',
          document_hash: report.documentHash,
          risk_score: report.riskScore,
          summary: report.summary,
          completed_at: report.generatedAt
        })
        .eq('id', pending.id);

      if (report.findings.length > 0) {
        await db.from('audit_findings').insert(
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
      }

      // Best-effort completion notification — failures are silent.
      void sendAuditCompletedEmail({
        organizationId: meta.organizationId,
        auditId: pending.id,
        riskScore: report.riskScore,
        findingsCount: report.findings.length
      });
    } catch (err) {
      await db
        .from('audits')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : String(err)
        })
        .eq('id', pending.id);
    } finally {
      wipeBuffer(buffer);
    }
  })();

  return NextResponse.json({ auditId: pending.id, status: 'pending' }, { status: 202 });
}
