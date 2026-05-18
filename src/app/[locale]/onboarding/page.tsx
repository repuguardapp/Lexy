import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/OnboardingForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Countries surfaced in the onboarding dropdown. The list spans every
 * jurisdiction we audit against (cf. legal-frameworks.ts) plus a few
 * common business hubs whose visitors land here from the localised
 * geo-routing. We resolve the human-readable name at request time via
 * `Intl.DisplayNames(locale)` so the same array renders as "Saudi
 * Arabia" / "Arabie saoudite" / "المملكة العربية السعودية" without
 * a hand-maintained translation table.
 */
const COUNTRY_CODES = [
  // GCC bloc — primary GCC launch target
  'SA', 'AE', 'QA', 'BH', 'KW', 'OM',
  // EU GDPR jurisdictions
  'FR', 'DE', 'ES', 'IT', 'NL', 'IE', 'BE', 'AT', 'PT', 'SE', 'FI', 'DK', 'PL',
  // UK + North America
  'GB', 'US', 'CA',
  // APAC + LATAM frameworks
  'JP', 'BR',
  // Common Arabic-speaking business hubs that geo-route to /ar
  'EG', 'JO', 'LB'
] as const;

/** Default country selected for a given UI locale — the largest
 *  audit-buying market that fits the locale's region bias. */
const LOCALE_DEFAULT_COUNTRY: Record<string, string> = {
  ar: 'SA',
  fr: 'FR',
  de: 'DE',
  es: 'ES',
  ja: 'JP',
  'pt-br': 'BR',
  en: 'US'
};

export async function generateMetadata({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'onboarding' });
  return {
    title: `${t('title')} — LexyFlow`,
    robots: { index: false, follow: false }
  };
}

interface PageProps {
  params: { locale: string };
}

export default async function OnboardingPage({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('onboarding');

  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login?next=/${locale}/onboarding`);

  // Already onboarded — skip the form, go to dashboard.
  if (organizationIdFromUser(user)) {
    redirect(`/${locale}/dashboard`);
  }

  // Resolve country names through ICU's CLDR data. Intl.DisplayNames
  // is available in Node 20 (Vercel runtime) and every modern browser
  // — we render server-side anyway so client engine doesn't matter.
  // Collation falls back to root if the locale isn't recognised; the
  // sort is best-effort, not a correctness invariant.
  const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
  const countries = COUNTRY_CODES
    .map((code) => ({ code, name: displayNames.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const defaultCountry = LOCALE_DEFAULT_COUNTRY[locale] ?? 'US';

  const labels = {
    signedInAsTemplate: t.raw('signedInAs') as string,
    orgName: t('orgName'),
    orgNamePlaceholder: t('orgNamePlaceholder'),
    country: t('country'),
    countryHint: t('countryHint'),
    uiLocale: t('uiLocale'),
    reportLanguage: t('reportLanguage'),
    reportLanguageHint: t('reportLanguageHint'),
    reportLanguagePlaceholder: t('reportLanguagePlaceholder'),
    submit: t('submit'),
    submitting: t('submitting')
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-16 md:px-0">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-balance text-2xl">{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm
            locale={locale}
            userEmail={user.email ?? ''}
            labels={labels}
            countries={countries}
            defaultCountry={defaultCountry}
          />
        </CardContent>
      </Card>
    </div>
  );
}
