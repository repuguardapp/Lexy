import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { CheckoutButton } from '@/components/CheckoutButton';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { getLocaleDescriptor } from '@/i18n/locales';
import { buildHreflangAlternates } from '@/lib/hreflang';
import { getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';

interface PageProps {
  params: { locale: string };
  searchParams: { reason?: string };
}

export async function generateMetadata({ params }: PageProps) {
  unstable_setRequestLocale(params.locale);
  const alternates = await buildHreflangAlternates('/pricing');
  return {
    alternates: { canonical: `/${params.locale}/pricing`, languages: alternates }
  };
}

const PLANS = ['starter', 'pro', 'enterprise'] as const;

export default async function PricingPage({ params: { locale }, searchParams }: PageProps) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('pricing');
  const tNav = await getTranslations('nav');
  const descriptor = getLocaleDescriptor(locale);

  // Logged-in users can buy directly. Anonymous visitors get a
  // localized sign-in CTA on each plan card — checkout requires an
  // org id so the webhook can credit the right account.
  const user = await getCurrentUser();
  const orgId = (user && organizationIdFromUser(user)) ?? undefined;

  // Show a localized banner when the user was redirected here from a
  // gated path (e.g. /audit when out of credits). The allowed reasons
  // are hard-coded so a malicious `?reason=<xss>` can never reach the
  // DOM untranslated.
  const ALLOWED_REASONS = new Set(['no_credits', 'signin_required']);
  const reason = searchParams.reason && ALLOWED_REASONS.has(searchParams.reason)
    ? (searchParams.reason as 'no_credits' | 'signin_required')
    : null;
  const reasonMessage = reason ? t(`reasons.${reason}`) : null;

  const indicativePrices: Record<typeof PLANS[number], Record<string, number>> = {
    starter:    { USD: 49,  EUR: 45,  BRL: 249, JPY: 7_300, GBP: 39 },
    pro:        { USD: 199, EUR: 185, BRL: 990, JPY: 29_500, GBP: 159 },
    enterprise: { USD: 599, EUR: 549, BRL: 2_990, JPY: 89_000, GBP: 479 }
  };

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: descriptor.currency,
    maximumFractionDigits: 0
  });

  return (
    <section className="py-16">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">{t('title')}</h1>
        <p className="mt-3 text-pretty text-lg text-muted-foreground">{t('subtitle')}</p>
      </header>

      {reasonMessage && (
        <div
          className="mx-auto mt-8 max-w-2xl rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100"
          role="status"
          aria-live="polite"
        >
          {reasonMessage}
        </div>
      )}

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {PLANS.map((plan, index) => (
          <Card
            key={plan}
            className={index === 1 ? 'border-foreground/20 shadow-md' : undefined}
          >
            <CardHeader>
              <CardTitle className="text-xl">{t(`${plan}.name`)}</CardTitle>
              <CardDescription>{t(`${plan}.tagline`)}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight tabular-nums">
                  {formatter.format(indicativePrices[plan][descriptor.currency] ?? 0)}
                </span>
                <span className="text-sm text-muted-foreground">{t('perMonth')}</span>
              </div>
            </CardContent>
            <CardFooter>
              <CheckoutButton
                plan={plan}
                locale={locale}
                organizationId={orgId}
                label={t('checkout')}
                signInLabel={tNav('signIn')}
                signInHref={`/${locale}/login`}
              />
            </CardFooter>
          </Card>
        ))}
      </div>
    </section>
  );
}
