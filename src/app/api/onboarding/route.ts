import { NextResponse } from 'next/server';
import { z } from 'zod';
import { NATIVE_LOCALE_CODES } from '@/i18n/locales';
import { getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';
import { supabaseService } from '@/lib/supabase';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().trim().min(2).max(120),
  country: z.string().trim().length(2).toUpperCase(),
  uiLocale: z.enum(NATIVE_LOCALE_CODES as unknown as [string, ...string[]]),
  defaultReportLanguage: z.string().trim().min(2).max(10)
});

/**
 * One-shot org bootstrap. Called from /onboarding after the user finished
 * the magic-link flow. Creates the row, stamps the user's app_metadata so
 * RLS picks the membership up immediately on the next request, and
 * returns the org id.
 *
 * Idempotent in a benign way: if the user already has an organization_id
 * we return 200 + the existing id without touching the DB.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const existing = organizationIdFromUser(user);
  if (existing) return NextResponse.json({ organizationId: existing, alreadyOnboarded: true });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid_request', detail: String(err) }, { status: 400 });
  }

  const admin = supabaseService();

  const { data: org, error: insertErr } = await admin
    .from('organizations')
    .insert({
      name: body.name,
      country: body.country,
      ui_locale: body.uiLocale,
      default_report_language: body.defaultReportLanguage
    })
    .select('id')
    .single();

  if (insertErr || !org) {
    return NextResponse.json({ error: 'org_create_failed', detail: insertErr?.message }, { status: 500 });
  }

  // Stamp the membership in the user's app_metadata. Persisted by Supabase,
  // appears in `auth.jwt()->'app_metadata'->>'organization_id'` on the next
  // request — exactly what the RLS policies in 0001_init.sql expect.
  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata ?? {}), organization_id: org.id }
  });
  if (updateErr) {
    return NextResponse.json({ error: 'metadata_update_failed', detail: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ organizationId: org.id, alreadyOnboarded: false });
}
