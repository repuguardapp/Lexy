import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { CheckoutButton } from '@/components/CheckoutButton';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { getLocaleDescriptor } from '@/i18n/locales';
import { buildHreflangAlternates } from '@/lib/hreflang';

interface PageProps {
  params: { locale: string };
}

export async function generateMetadata({ params }: PageProps) {
  unstable_setRequestLocale(params.locale);
  const alternates = await buildHreflangAlternates('/pricing');
  return {
    alternates: { canonical: `/${params.locale}/pricing`, languages: alternates }
  };
}

const PLANS = ['starter', 'pro', 'enterprise'] as const;

export default async function PricingPage({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('pricing');
  const descriptor = getLocaleDescriptor(locale);

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
              <CheckoutButton plan={plan} locale={locale} label={t('checkout')} />
            </CardFooter>
          </Card>
        ))}
      </div>
    </section>
  );
}
