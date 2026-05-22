import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { type ReactNode } from 'react';
import { LanguageSelector } from '@/components/LanguageSelector';
import { Lexymark } from '@/components/Lexymark';
import { SignOutButton } from '@/components/SignOutButton';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getLocaleDescriptor, NATIVE_LOCALE_CODES } from '@/i18n/locales';
import { discoverLocales } from '@/i18n/locales.server';
import { buildHreflangAlternates } from '@/lib/hreflang';
import { getCurrentUser } from '@/lib/supabase-server';

export async function generateStaticParams() {
  return NATIVE_LOCALE_CODES.map((locale) => ({ locale }));
}

interface LayoutProps {
  children: ReactNode;
  params: { locale: string };
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { locale } = params;
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'meta' });
  const alternates = await buildHreflangAlternates('/');
  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `/${locale}`,
      languages: alternates
    }
  };
}

export default async function LocaleLayout({ children, params: { locale } }: LayoutProps) {
  const available = await discoverLocales();
  if (!available.includes(locale.toLowerCase())) notFound();

  unstable_setRequestLocale(locale);
  const messages = await getMessages();
  const descriptor = getLocaleDescriptor(locale);
  const tNav = await getTranslations('nav');
  const tFooter = await getTranslations('footer');
  const tBilling = await getTranslations('billing');

  // Read the auth state on every layout render so the header reflects
  // the user's signed-in status without a client-side flash. Server
  // Components evaluate this synchronously off the same request
  // cookies the rest of the app uses — no double round-trip, no
  // hydration mismatch.
  const user = await getCurrentUser();
  const isAuthenticated = !!user;

  return (
    <html lang={descriptor.code} dir={descriptor.direction}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
            <div className="container flex h-16 items-center justify-between gap-4">
              <Link href="/" className="inline-flex items-center gap-2">
                <Lexymark className="h-6 w-6" />
                <span className="text-base font-semibold tracking-tight">LexyFlow</span>
              </Link>

              <nav className="hidden items-center gap-6 text-sm md:flex">
                <Link
                  href="/pricing"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {tNav('pricing')}
                </Link>
                <Link
                  href="/docs"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {tNav('docs')}
                </Link>
              </nav>

              <div className="flex items-center gap-2">
                <LanguageSelector />
                {isAuthenticated ? (
                  <>
                    <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
                      <Link href="/dashboard">{tNav('myDashboard')}</Link>
                    </Button>
                    <SignOutButton label={tBilling('signOut')} />
                  </>
                ) : (
                  <>
                    <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
                      <Link href="/login">{tNav('signIn')}</Link>
                    </Button>
                    <Button asChild size="sm">
                      <Link href="/audit">{tNav('startAudit')}</Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </header>

          <main className="container">{children}</main>

          <footer className="border-t">
            <div className="container flex flex-col items-center justify-between gap-3 py-8 text-sm text-muted-foreground sm:flex-row">
              <span>{tFooter('copyright', { year: new Date().getFullYear() })}</span>
              <div className="flex flex-wrap gap-6">
                <Link href="/privacy" className="hover:text-foreground">{tFooter('privacy')}</Link>
                <Link href="/terms" className="hover:text-foreground">{tFooter('terms')}</Link>
                <Link href="/dpa" className="hover:text-foreground">{tFooter('dpa')}</Link>
              </div>
            </div>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
