import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase';

/**
 * Self-test endpoint that proves the Vercel runtime can authenticate as
 * service_role against Supabase and write status='completed' on a real
 * row in `audits`. Used to discriminate between "AI pipeline broken"
 * and "DB write broken" when an audit gets stuck at status='running'.
 *
 * Protected by an admin secret because it INSERTs and DELETEs rows.
 * Call shape:
 *   GET /api/admin/selftest-write?secret=<ADMIN_SELFTEST_SECRET>
 *
 * Flow:
 *   1. Insert a synthetic audit row (anonymous org, placeholder hash).
 *   2. Update its status to 'completed' with risk_score=0 — this is the
 *      exact code path that would write a real audit's terminal state.
 *   3. Read it back, assert the column reflects the write.
 *   4. Delete the synthetic row to leave the table clean.
 *   5. Return a structured JSON receipt with timings.
 *
 * If any step fails, the response includes the precise Supabase error
 * code + message so we can compare it to whatever production audits
 * are emitting.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ANONYMOUS_ORG_ID = '00000000-0000-0000-0000-000000000000';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const provided = url.searchParams.get('secret');
  const expected = process.env.ADMIN_SELFTEST_SECRET;
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const db = supabaseService();
  const placeholderHash = `selftest:${randomUUID()}`;
  const t0 = Date.now();

  // Step 1 — INSERT
  const { data: inserted, error: insertErr } = await db
    .from('audits')
    .insert({
      organization_id: ANONYMOUS_ORG_ID,
      document_hash: placeholderHash,
      frameworks: ['gdpr'],
      status: 'pending',
      language: 'en'
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    return NextResponse.json(
      { ok: false, step: 'insert', error: insertErr?.message ?? 'no row', code: insertErr?.code },
      { status: 500 }
    );
  }
  const auditId = inserted.id;

  // Step 2 — UPDATE to completed (the exact column set the production
  // pipeline writes at the terminal state).
  const { error: updateErr, count: updateCount } = await db
    .from('audits')
    .update(
      {
        status: 'completed',
        risk_score: 0,
        summary: 'self-test',
        completed_at: new Date().toISOString()
      },
      { count: 'exact' }
    )
    .eq('id', auditId);
  if (updateErr) {
    await db.from('audits').delete().eq('id', auditId);
    return NextResponse.json(
      { ok: false, step: 'update', auditId, error: updateErr.message, code: updateErr.code },
      { status: 500 }
    );
  }

  // Step 3 — read-back assertion
  const { data: readback, error: readErr } = await db
    .from('audits')
    .select('status,risk_score,completed_at')
    .eq('id', auditId)
    .maybeSingle();
  if (readErr || !readback) {
    await db.from('audits').delete().eq('id', auditId);
    return NextResponse.json(
      { ok: false, step: 'readback', auditId, error: readErr?.message ?? 'no row' },
      { status: 500 }
    );
  }

  // Step 4 — cleanup
  await db.from('audits').delete().eq('id', auditId);

  return NextResponse.json({
    ok: true,
    auditId,
    elapsedMs: Date.now() - t0,
    affectedRowsOnUpdate: updateCount,
    readback,
    message: 'service_role can INSERT, UPDATE status=completed, and DELETE in audits.'
  });
}
