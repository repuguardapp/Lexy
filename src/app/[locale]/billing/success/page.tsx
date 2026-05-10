import { CheckCircle2 } from 'lucide-react';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

interface PageProps {
  params: { locale: string };
  searchParams: { session_id?: string };
}

export async function generateMetadata({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'billing' });
  return {
    title: `${t('successTitle')} — LexyFlow`,
    robots: { index: false, follow: false }
  };
}

export default async function BillingSuccessPage({
  params: { locale },
  searchParams
}: PageProps) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('billing');
  const sessionId = searchParams.session_id;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center px-4 py-16 md:px-0">
      <div className="grid w-full gap-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400">
          <CheckCircle2 className="h-8 w-8" />
        </div>

        <div className="grid gap-2">
          <h1 className="text-balance text-3xl font-semibold tracking-tight">
            {t('successTitle')}
          </h1>
          <p className="text-pretty text-muted-foreground">
            {t('successBody')}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/audit">{t('successCta')}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/docs">{t('successDocs')}</Link>
          </Button>
        </div>

        {sessionId && (
          <p className="font-mono text-xs text-muted-foreground">
            ref: {sessionId.slice(0, 24)}…
          </p>
        )}
      </div>
    </div>
  );
}
