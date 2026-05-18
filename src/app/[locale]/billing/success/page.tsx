import { CheckCircle2, Coins } from 'lucide-react';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { supabaseService } from '@/lib/supabase';
import { getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';

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

/**
 * Look up the org's freshly-incremented credit balance so the page can
 * confirm visually that the webhook fired and the top-up landed. The
 * Stripe webhook runs server-side BEFORE this page renders (Stripe
 * sends `invoice.paid` synchronously with the redirect), so reading the
 * row here is the most reliable place to surface "yes, you got N
 * credits" without polling.
 *
 * Returns null on any failure path — the page falls back to the generic
 * success copy so we never break the post-payment landing on an
 * unrelated bug.
 */
async function fetchCreditsForCurrentOrg(): Promise<number | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;
    const orgId = organizationIdFromUser(user);
    if (!orgId) return null;
    const { data } = await supabaseService()
      .from('organizations')
      .select('credits_remaining')
      .eq('id', orgId)
      .maybeSingle();
    const v = (data as { credits_remaining?: number } | null)?.credits_remaining;
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

export default async function BillingSuccessPage({
  params: { locale },
  searchParams
}: PageProps) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('billing');
  const sessionId = searchParams.session_id;
  const credits = await fetchCreditsForCurrentOrg();

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

        {credits !== null && credits > 0 && (
          <div className="mx-auto inline-flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm">
            <Coins className="h-5 w-5 flex-none text-green-600 dark:text-green-400" aria-hidden />
            <div className="text-start">
              <div className="font-medium text-foreground">{t('creditsAdded')}</div>
              <div className="text-muted-foreground">
                {t('creditsAvailable', { count: credits })}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/audit">{t('successCta')}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/dashboard">{t('successDashboard')}</Link>
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
