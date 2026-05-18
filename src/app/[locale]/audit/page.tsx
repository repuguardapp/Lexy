import { ShieldCheck } from 'lucide-react';
import { getMessages, getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AuditForm } from '@/components/AuditForm';
import { buildAuditFormLabels } from '@/lib/audit-labels';
import { FRAMEWORKS, frameworksForCountry } from '@/lib/legal-frameworks';
import { supabaseService } from '@/lib/supabase';
import { getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { locale: string };
}

export default async function AuditPage({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('audit');

  // Tri-state auth gate (CEO-mandated):
  //   1. Not signed in           → /login?next=/{locale}/audit
  //   2. Signed in, 0 credits    → /pricing?reason=no_credits
  //   3. Signed in, has credits  → render the form
  // The embed widget (/embed/audit) keeps the anonymous-org flow for
  // third-party integrations — that path doesn't touch this page.
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/${locale}/login?next=/${locale}/audit`);
  }
  const orgId = organizationIdFromUser(user);
  if (!orgId) {
    redirect(`/${locale}/onboarding`);
  }

  // Read the credit balance directly from the org row. The audit
  // endpoint will atomically re-check via try_consume_audit_credit
  // anyway, but doing it here lets us redirect proactively with a
  // friendly reason banner instead of dropping the user into the
  // form only to see it 402 on submit.
  const { data: org } = await supabaseService()
    .from('organizations')
    .select('credits_remaining,country')
    .eq('id', orgId)
    .maybeSingle();
  const orgRow = org as { credits_remaining?: number; country?: string } | null;
  const credits = orgRow?.credits_remaining ?? 0;
  if (credits <= 0) {
    redirect(`/${locale}/pricing?reason=no_credits`);
  }

  // Pre-select the framework(s) that apply to the org's country so a
  // Saudi org lands with `saudi_pdpl` already checked. Falls back to
  // empty selection (user picks manually) when the country has no
  // framework in our matrix — better than guessing wrong.
  const defaultFrameworkIds = orgRow?.country
    ? frameworksForCountry(orgRow.country).map((f) => f.id)
    : [];

  // Pass the full errors namespace as a flat dict so the client
  // component can do labels.errors[code] without a server round-trip.
  const messages = (await getMessages()) as unknown as { errors?: Record<string, string> };
  const errorMessages = messages.errors ?? {};

  return (
    <div className="mx-auto grid max-w-2xl gap-10 px-4 py-16 md:px-0">
      <header className="grid gap-2">
        <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          {t('upload')}
        </h1>
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          {t('zeroKnowledge')}
        </p>
      </header>

      <AuditForm
        labels={buildAuditFormLabels(t, errorMessages)}
        frameworks={FRAMEWORKS.map((f) => ({ id: f.id, name: f.name }))}
        defaultFrameworkIds={defaultFrameworkIds}
        defaultLanguage={locale}
        organizationId={orgId}
        locale={locale}
      />
    </div>
  );
}
