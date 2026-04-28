import { unstable_setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { SignInForm } from '@/components/SignInForm';
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
          <SignInForm locale={locale} />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            New here?{' '}
            <Link href="/audit" className="font-medium text-foreground hover:underline">
              Run an audit
            </Link>{' '}
            first — no account needed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
