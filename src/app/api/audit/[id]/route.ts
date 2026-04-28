import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseService } from '@/lib/supabase';

/**
 * Polling endpoint for the async audit pipeline.
 *
 * Returns ONLY status metadata — never document text, never raw findings
 * (those require auth + RLS via the dashboard). Designed to be called
 * unauthenticated by the user who just submitted the audit.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().uuid() });

export async function GET(_request: Request, ctx: { params: { id: string } }) {
  const parsed = Params.safeParse(ctx.params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const { data: audit, error } = await supabaseService()
    .from('audits')
    .select('id,status,risk_score,language,created_at,completed_at,error_message')
    .eq('id', parsed.data.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  if (!audit) return NextResponse.json({ error: 'not_found' },   { status: 404 });

  // Findings count is a tiny COUNT query — useful for the UI without
  // exposing the findings themselves.
  let findingsCount = 0;
  if (audit.status === 'completed') {
    const { count } = await supabaseService()
      .from('audit_findings')
      .select('*', { count: 'exact', head: true })
      .eq('audit_id', audit.id);
    findingsCount = count ?? 0;
  }

  return NextResponse.json(
    {
      id: audit.id,
      status: audit.status,
      riskScore: audit.risk_score,
      language: audit.language,
      createdAt: audit.created_at,
      completedAt: audit.completed_at,
      findingsCount,
      ...(audit.error_message ? { error: audit.error_message } : {})
    },
    {
      headers: {
        // Discourage caching — clients poll this every few seconds.
        'Cache-Control': 'no-store'
      }
    }
  );
}
