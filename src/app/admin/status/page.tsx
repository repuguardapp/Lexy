import { CheckCircle2, XCircle } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isAdminEmail } from '@/lib/admin';
import { getCurrentUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Status — LexyFlow admin',
  robots: { index: false, follow: false }
};

interface ProviderStatus {
  name: string;
  url: string;
  ok: boolean;
  latencyMs: number;
  status: number | string;
}

const PROVIDERS = [
  { name: 'Anthropic',  url: 'https://api.anthropic.com/v1/messages',                  expectedStatuses: [400, 401] },
  { name: 'OpenAI',     url: 'https://api.openai.com/v1/models',                       expectedStatuses: [401] },
  { name: 'Stripe',     url: 'https://api.stripe.com/v1/account',                      expectedStatuses: [401] },
  { name: 'Supabase',   url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://supabase.com/', expectedStatuses: [200, 401, 404] },
  { name: 'Resend',     url: 'https://api.resend.com/domains',                         expectedStatuses: [401] },
  { name: 'Sentry',     url: 'https://sentry.io/api/0/',                               expectedStatuses: [200, 401] }
];

export default async function StatusPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/en/login?next=/admin/status');
  if (!isAdminEmail(user.email)) {
    // Don't reveal that the page exists — opaque 404 by way of the not-found
    // signal would be better, but redirecting to / is good enough.
    redirect('/en');
  }

  const checks = await Promise.all(
    PROVIDERS.map(async (p): Promise<ProviderStatus> => {
      const t0 = Date.now();
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5_000);
        const res = await fetch(p.url, { method: 'GET', signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(timer);
        const ok = p.expectedStatuses.includes(res.status) || (res.status >= 200 && res.status < 500);
        return { name: p.name, url: p.url, ok, latencyMs: Date.now() - t0, status: res.status };
      } catch (err) {
        return {
          name: p.name,
          url: p.url,
          ok: false,
          latencyMs: Date.now() - t0,
          status: err instanceof Error ? err.name : 'error'
        };
      }
    })
  );

  const allOk = checks.every((c) => c.ok);

  return (
    <div className="mx-auto max-w-3xl py-12">
      <header className="mb-8 grid gap-2">
        <h1 className="text-balance text-3xl font-semibold tracking-tight">
          Provider status
        </h1>
        <p className="text-pretty text-muted-foreground">
          Live ping of every external dependency. Refresh to re-check.
        </p>
        <div>
          <Badge variant={allOk ? 'secondary' : 'destructive'}>
            {allOk ? 'All systems normal' : 'Degradation detected'}
          </Badge>
        </div>
      </header>

      <ul className="grid gap-3">
        {checks.map((c) => (
          <li key={c.name}>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {c.ok ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive" aria-hidden />
                    )}
                    <CardTitle className="text-base font-medium">{c.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-3 text-sm tabular-nums">
                    <span className="text-muted-foreground">{c.latencyMs} ms</span>
                    <Badge variant="outline" className="font-mono text-xs">{c.status}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <CardDescription className="font-mono text-xs">{c.url}</CardDescription>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs text-muted-foreground">
        A 401 is expected on most providers — we hit unauthenticated endpoints
        deliberately to avoid leaking credentials. We treat 4xx as "reachable".
      </p>
    </div>
  );
}
