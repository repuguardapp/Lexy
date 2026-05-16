import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logAccess } from '@/lib/access-log';
import { hashAuditId, signDeletionReceipt } from '@/lib/deletion-receipt';
import { clientIpFrom } from '@/lib/rate-limit';
import { supabaseService } from '@/lib/supabase';
import { getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';

/**
 * Polling endpoint for the async audit pipeline.
 *
 * Returns ONLY status metadata — never document text, never raw findings
 * (those require auth + RLS via the dashboard). Designed to be called
 * unauthenticated by the user who just submitted the audit.
 *
 * Self-healing: if a row has been at status='running' or 'pending' for
 * longer than the worst-case backend pipeline (Anthropic 240s + OpenAI
 * 90s + extraction + persistence + buffer ≈ 6 minutes), we know the
 * waitUntil background task was killed (Vercel function instance
 * recycled mid-flight). There is nobody to flip the row to 'failed',
 * so the GET endpoint does it itself on the next poll. This guarantees
 * every audit eventually resolves to a terminal status, and the
 * front-end never sees an indefinite spinner regardless of what
 * happened on the backend.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().uuid() });

const RUNAWAY_THRESHOLD_MS = 6 * 60 * 1_000; // 6 min — see header comment

export async function GET(_request: Request, ctx: { params: { id: string } }) {
  const parsed = Params.safeParse(ctx.params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const db = supabaseService();
  const { data: audit, error } = await db
    .from('audits')
    .select('id,organization_id,status,risk_score,language,created_at,completed_at,error_message')
    .eq('id', parsed.data.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  if (!audit) return NextResponse.json({ error: 'not_found' },   { status: 404 });

  // ---- Self-heal stuck rows --------------------------------------
  let effectiveStatus: string = audit.status;
  let effectiveError: string | null = audit.error_message ?? null;
  if (audit.status === 'pending' || audit.status === 'running') {
    const ageMs = Date.now() - new Date(audit.created_at).getTime();
    if (ageMs > RUNAWAY_THRESHOLD_MS) {
      console.error('[audit/get] runaway_detected', {
        auditId: audit.id,
        ageSec: Math.round(ageMs / 1000),
        previousStatus: audit.status
      });
      const message = `audit_runaway_timeout: stuck at status=${audit.status} for ${Math.round(ageMs / 1000)}s`;
      const { error: healErr } = await db
        .from('audits')
        .update({ status: 'failed', error_message: message })
        .eq('id', audit.id)
        // Guard against a TOCTOU race: don't clobber a status that
        // changed between our SELECT and this UPDATE.
        .in('status', ['pending', 'running']);
      if (healErr) {
        console.error('[audit/get] runaway_heal_failed', { auditId: audit.id, error: healErr.message });
      } else {
        effectiveStatus = 'failed';
        effectiveError = message;
        // Refund the credit too — the customer didn't get a report.
        const { error: refundErr } = await db.rpc('refund_audit_credit', {
          p_org_id: audit.organization_id
        });
        if (refundErr) {
          console.error('[audit/get] runaway_refund_failed', { auditId: audit.id, error: refundErr.message });
        }
      }
    }
  }
  // ----------------------------------------------------------------

  // Findings count is a tiny COUNT query — useful for the UI without
  // exposing the findings themselves.
  let findingsCount = 0;
  if (effectiveStatus === 'completed') {
    const { count } = await db
      .from('audit_findings')
      .select('*', { count: 'exact', head: true })
      .eq('audit_id', audit.id);
    findingsCount = count ?? 0;
  }

  return NextResponse.json(
    {
      id: audit.id,
      status: effectiveStatus,
      riskScore: audit.risk_score,
      language: audit.language,
      createdAt: audit.created_at,
      completedAt: audit.completed_at,
      findingsCount,
      ...(effectiveError ? { error: effectiveError } : {})
    },
    {
      headers: {
        // Discourage caching — clients poll this every few seconds.
        'Cache-Control': 'no-store'
      }
    }
  );
}

const ANONYMOUS_ORG_ID = '00000000-0000-0000-0000-000000000000';

/**
 * "Delete forever" — Tier 1 trust feature.
 *
 * Hard-deletes the audit row (cascades to findings + ciphertext via
 * ON DELETE CASCADE) and writes a tamper-evident receipt to
 * deletion_log. Returns the signed receipt body to the client so the
 * customer has cryptographic proof of the deletion they can present
 * later to a regulator.
 *
 * Auth: the audit must belong to the caller's organization. Anonymous-
 * org audits are not deletable via this endpoint — they were created
 * without an account and live on the public-share semantics; if they
 * need to disappear, a system purge job handles that separately.
 */
export async function DELETE(request: Request, ctx: { params: { id: string } }) {
  const parsed = Params.safeParse(ctx.params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  const auditId = parsed.data.id;
  const db = supabaseService();

  const { data: audit, error } = await db
    .from('audits')
    .select('id,organization_id')
    .eq('id', auditId)
    .maybeSingle();
  if (error || !audit) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (audit.organization_id === ANONYMOUS_ORG_ID) {
    return NextResponse.json({ error: 'not_deletable' }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user || organizationIdFromUser(user) !== audit.organization_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const ip = clientIpFrom(request.headers);
  const ua = request.headers.get('user-agent');
  const deletedAt = new Date().toISOString();

  // Issue the receipt BEFORE the delete so a crypto-key configuration
  // error (missing DOCUMENT_ENCRYPTION_KEY) fails closed — we'd
  // rather refuse to delete than delete-without-receipt.
  let receipt;
  try {
    receipt = signDeletionReceipt(auditId, deletedAt);
  } catch (err) {
    return NextResponse.json(
      { error: 'receipt_failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }

  // Persist the tamper-evident ledger row first. If the actual DELETE
  // races with another writer (or fails), we keep the ledger entry as
  // proof the deletion was requested.
  const { error: ledgerErr } = await db.from('deletion_log').insert({
    organization_id: audit.organization_id,
    audit_id_hash: hashAuditId(auditId),
    deleted_at: deletedAt,
    deleted_by: user.id,
    ip,
    receipt_signature: receipt.signature
  });
  if (ledgerErr) {
    return NextResponse.json(
      { error: 'ledger_write_failed', detail: ledgerErr.message },
      { status: 500 }
    );
  }

  // Cascade-deletes findings and zeroes out the ciphertext columns.
  const { error: deleteErr } = await db.from('audits').delete().eq('id', auditId);
  if (deleteErr) {
    return NextResponse.json(
      { error: 'delete_failed', detail: deleteErr.message },
      { status: 500 }
    );
  }

  await logAccess({
    organizationId: audit.organization_id,
    action: 'audit_deleted',
    userId: user.id,
    auditId,
    ip,
    userAgent: ua
  });

  return NextResponse.json(
    { receipt },
    {
      headers: {
        'Cache-Control': 'no-store',
        // Encourage clients (the UI) to surface the receipt as a
        // download. The actual filename is set client-side because
        // Content-Disposition on a JSON body is awkward to consume.
        'X-Receipt-Issued': '1'
      }
    }
  );
}
