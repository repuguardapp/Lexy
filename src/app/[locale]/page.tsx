import { ArrowRight, Globe, Languages, ShieldCheck, Sparkles } from 'lucide-react';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { discoverLocales } from '@/i18n/locales';
import { FRAMEWORKS } from '@/lib/legal-frameworks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface PageProps {
  params: { locale: string };
}

export default async function HomePage({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('home');
  const available = await discoverLocales();

  return (
    <div className="space-y-32 pb-20">
      <Hero locale={locale} t={t} />
      <Stats t={t} available={available.length} />
      <Features t={t} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                               */
/* ------------------------------------------------------------------ */

async function Hero({
  locale,
  t
}: {
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations<'home'>>>;
}) {
  return (
    <section className="relative pt-20 md:pt-28">
      {/* Subtle radial gradient — Shadcn-style backdrop, never noisy. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [background:radial-gradient(60%_60%_at_50%_0%,hsl(var(--accent))_0%,transparent_60%)]"
      />

      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center animate-fade-up">
        <Badge variant="outline" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {t('hero.eyebrow')}
        </Badge>

        <h1
          lang={locale}
          className="text-balance text-4xl font-semibold tracking-tight md:text-6xl md:leading-[1.05]"
        >
          {t('hero.title')}
        </h1>

        <p className="text-pretty max-w-2xl text-lg text-muted-foreground md:text-xl">
          {t('hero.subtitle')}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button asChild size="lg">
            <Link href="/audit">
              {t('hero.cta')}
              <ArrowRight className="ms-2 h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/sample-report">{t('hero.secondaryCta')}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Stats                                                              */
/* ------------------------------------------------------------------ */

function Stats({
  t,
  available
}: {
  t: Awaited<ReturnType<typeof getTranslations<'home'>>>;
  available: number;
}) {
  const items = [
    { value: String(FRAMEWORKS.length), label: t('trust.frameworks') },
    { value: '6', label: t('trust.languages') },
    { value: `${Math.max(0, available - 6)}+`, label: t('trust.extraLanguages') }
  ];
  return (
    <section className="border-y bg-muted/30">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-px overflow-hidden rounded-none border-x bg-border md:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="bg-background p-8 text-center">
            <div className="text-4xl font-semibold tabular-nums tracking-tight">{item.value}</div>
            <div className="mt-2 text-sm text-muted-foreground">{item.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Features                                                           */
/* ------------------------------------------------------------------ */

function Features({
  t
}: {
  t: Awaited<ReturnType<typeof getTranslations<'home'>>>;
}) {
  const features = [
    {
      icon: Languages,
      title: t('features.multiPass.title'),
      body: t('features.multiPass.body')
    },
    {
      icon: ShieldCheck,
      title: t('features.zeroKnowledge.title'),
      body: t('features.zeroKnowledge.body')
    },
    {
      icon: Globe,
      title: t('features.global.title'),
      body: t('features.global.body')
    }
  ];

  return (
    <section className="mx-auto max-w-5xl">
      <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
        {t('features.title')}
      </h2>
      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <CardTitle className="pt-2">{title}</CardTitle>
              <CardDescription className="text-pretty">{body}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>
    </section>
  );
}
