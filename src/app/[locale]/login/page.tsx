import { Mail } from 'lucide-react';
import { unstable_setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buildHreflangAlternates } from '@/lib/hreflang';

interface PageProps {
  params: { locale: string };
}

export async function generateMetadata({ params }: PageProps) {
  unstable_setRequestLocale(params.locale);
  const alternates = await buildHreflangAlternates('/login');
  return {
    title: 'Sign in — LexyFlow',
    alternates: { canonical: `/${params.locale}/login`, languages: alternates }
  };
}

/**
 * Login scaffold. Wire to Supabase Auth's magic-link flow once the
 * Supabase project is provisioned (DEPLOY.md step 2).
 */
export default async function LoginPage({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center py-16">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle>Sign in to LexyFlow</CardTitle>
          <CardDescription>
            We&apos;ll email you a magic link. No password to remember.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" action="#" method="post">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <Button type="submit" size="lg" className="w-full" disabled>
              <Mail className="me-2 h-4 w-4" />
              Email me a magic link
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Auth wires up once Supabase is provisioned — see <code>DEPLOY.md</code>.
            </p>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            New here? <Link href="/audit" className="font-medium text-foreground hover:underline">Run an audit</Link> first — no account needed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
