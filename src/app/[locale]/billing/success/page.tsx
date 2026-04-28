import { CheckCircle2 } from 'lucide-react';
import { unstable_setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

interface PageProps {
  params: { locale: string };
  searchParams: { session_id?: string };
}

export const metadata = {
  title: 'Subscription confirmed — LexyFlow',
  robots: { index: false, follow: false }
};

export default async function BillingSuccessPage({
  params: { locale },
  searchParams
}: PageProps) {
  unstable_setRequestLocale(locale);
  const sessionId = searchParams.session_id;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center py-16">
      <div className="grid w-full gap-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400">
          <CheckCircle2 className="h-8 w-8" />
        </div>

        <div className="grid gap-2">
          <h1 className="text-balance text-3xl font-semibold tracking-tight">
            You&apos;re in. Welcome to LexyFlow.
          </h1>
          <p className="text-pretty text-muted-foreground">
            Your subscription is active. Stripe has emailed your receipt.
            We&apos;ve provisioned your workspace — head to the audit page
            to upload your first document.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/audit">Run my first audit</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/docs">Read the docs</Link>
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
