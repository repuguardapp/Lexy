import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { SignInForm } from '@/components/SignInForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buildHreflangAlternates } from '@/lib/hreflang';
import { getCurrentUser } from '@/lib/supabase-server';

interface PageProps {
  params: { locale: string };
}

export async function generateMetadata({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'auth' });
  const alternates = await buildHreflangAlternates('/login');
  return {
    title: `${t('signInTitle')} — LexyFlow`,
    alternates: { canonical: `/${locale}/login`, languages: alternates }
  };
}

export default async function LoginPage({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('auth');

  // Belt-and-braces redirect: never show the magic-link form to a
  // visitor who already has a valid session. The layout chrome hides
  // the "Sign in" button for authed users, but a user can still land
  // here via:
  //   - a stale bookmark / browser-history entry
  //   - a direct paste of /<locale>/login into the URL bar
  //   - a layout that briefly missed the cookie during propagation
  //     after the magic-link callback
  // In every one of those cases we route to the dashboard so the
  // signed-in state is honoured.
  const user = await getCurrentUser();
  if (user) {
    redirect(`/${locale}/dashboard`);
  }

  // Surface the SignInForm's label bundle on the server so the client
  // component ships zero translation logic and the same JS bundle
  // serves every locale.
  const labels = {
    emailLabel: t('emailLabel'),
    emailPlaceholder: t('emailPlaceholder'),
    submit: t('submit'),
    submitting: t('submitting'),
    inboxTitle: t('inboxTitle'),
    inboxBody: t('inboxBody'),
    inboxRetry: t('inboxRetry'),
    errorService: t('errorService'),
    errorRateLimited: t('errorRateLimited'),
    errorGeneric: t('errorGeneric')
  };

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center px-4 py-16 md:px-0">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle>{t('signInTitle')}</CardTitle>
          <CardDescription>{t('signInTagline')}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm locale={locale} labels={labels} />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t('newHere')}{' '}
            <Link href="/audit" className="font-medium text-foreground hover:underline">
              {t('newHereCta')}
            </Link>{' '}
            {t('newHereSuffix')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
