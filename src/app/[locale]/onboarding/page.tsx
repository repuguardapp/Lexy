import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/OnboardingForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

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

  // The signedInAs string carries a <bold>{email}</bold> tag. We resolve
  // it on the server (it's not interactive) and pass the rendered HTML
  // string into the client form via a label bundle — same pattern as
  // the audit form.
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
          <OnboardingForm locale={locale} userEmail={user.email ?? ''} labels={labels} />
        </CardContent>
      </Card>
    </div>
  );
}
