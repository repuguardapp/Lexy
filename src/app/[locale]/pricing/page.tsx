import { headers } from 'next/headers';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { CheckoutButton } from '@/components/CheckoutButton';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { getLocaleDescriptor } from '@/i18n/locales';
import { buildHreflangAlternates } from '@/lib/hreflang';
import { getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';

/**
 * Country → preferred display currency.
 *
 * Two design constraints govern this map:
 *
 *   1. Stripe Adaptive Pricing (enabled in Dashboard) will charge
 *      the buyer in their local currency at checkout, regardless of
 *      what we display here. So this map exists ONLY to keep the
 *      marketing surface aligned with what Stripe Checkout will
 *      eventually show — a Saudi buyer should see SAR on /pricing
 *      AND SAR on Stripe Checkout, not "180 AED → 175 SAR" disconnect.
 *
 *   2. We only enumerate countries whose currency we have an
 *      indicative price for. Any other country falls back to the
 *      locale descriptor (which itself falls back to USD), so a
 *      Polish visitor on /fr still sees EUR — the descriptor wins
 *      when the country lookup misses.
 *
 * GCC bloc — all six member states get their native currency.
 * Other Arabic-speaking hubs (Egypt, Jordan, Lebanon) don't have
 * a configured currency in our matrix and fall back to descriptor
 * (USD if they're on /ar with no peg, EUR if on /fr, etc.).
 */
const COUNTRY_TO_DISPLAY_CURRENCY: Record<string, string> = {
  SA: 'SAR',
  QA: 'QAR',
  AE: 'AED',
  BH: 'BHD',
  KW: 'KWD',
  OM: 'OMR'
};

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

// Force per-request rendering: we read x-vercel-ip-country below to
// switch the displayed currency by visitor country. Without this,
// Next.js would prerender /pricing once at build time with no
// header context, freezing every visitor to the locale-descriptor
// fallback (USD/EUR/AED depending on URL) regardless of where they
// actually browse from.
export const dynamic = 'force-dynamic';

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

  // Indicative prices per plan / currency. Marketing-only — Stripe
  // Adaptive Pricing applies the real-time FX conversion from the
  // EUR base Price at checkout, so these numbers are rounded to a
  // local-looking figure in each market (185 EUR, not 184.30; 750
  // SAR, not 743.27). The GCC currencies are all USD-pegged so the
  // rounded amounts stay within ~2% of what Stripe will charge.
  //
  // Conversion source of truth: 1 EUR ≈ 1.085 USD,
  //   1 USD = 3.67 AED, 3.75 SAR, 3.64 QAR, 0.376 BHD, 0.305 KWD,
  //          0.385 OMR (central-bank pegs, May 2026).
  const indicativePrices: Record<typeof PLANS[number], Record<string, number>> = {
    starter: {
      USD: 49,  EUR: 45,  BRL: 249,   JPY: 7_300,  GBP: 39,
      AED: 180, SAR: 185, QAR: 180,   BHD: 19,     KWD: 15,  OMR: 19
    },
    pro: {
      USD: 199, EUR: 185, BRL: 990,   JPY: 29_500, GBP: 159,
      AED: 730, SAR: 750, QAR: 720,   BHD: 75,     KWD: 60,  OMR: 76
    },
    enterprise: {
      USD: 599,   EUR: 549,   BRL: 2_990, JPY: 89_000, GBP: 479,
      AED: 2_200, SAR: 2_250, QAR: 2_200, BHD: 225,    KWD: 180, OMR: 230
    }
  };

  // Pick the display currency in this priority order:
  //   1. The buyer's IP-detected country, if we have a peg for it
  //      (covers the GCC bloc — a Saudi visitor sees SAR even when
  //      they're browsing /ar, /en or /fr).
  //   2. The locale descriptor's currency, if it's in our matrix.
  //   3. USD as a last-resort fallback — protects against shipping
  //      a new locale without a peg (the "0 د.إ" prod incident).
  const countryHeader = headers().get('x-vercel-ip-country');
  const countryCode = countryHeader?.toUpperCase() ?? '';
  const ipCurrency = COUNTRY_TO_DISPLAY_CURRENCY[countryCode];
  const priced =
    (ipCurrency && indicativePrices.starter[ipCurrency] !== undefined && ipCurrency) ||
    (indicativePrices.starter[descriptor.currency] !== undefined && descriptor.currency) ||
    'USD';

  // Force whole-unit display. BHD / KWD / OMR default to 3 decimals
  // in CLDR — without `minimumFractionDigits: 0` we'd render "19.000
  // BD" which is visually noisy on a pricing card.
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: priced,
    minimumFractionDigits: 0,
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
                  {formatter.format(indicativePrices[plan][priced] ?? 0)}
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
