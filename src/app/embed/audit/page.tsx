import { ShieldCheck } from 'lucide-react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { AuditForm } from '@/components/AuditForm';
import { EmbedAutosize } from '@/components/EmbedAutosize';
import { DEFAULT_LOCALE, getLocaleDescriptor, isNativeLocale } from '@/i18n/locales';
import { FRAMEWORKS, type FrameworkId } from '@/lib/legal-frameworks';
import '@/app/globals.css';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

const ANONYMOUS_ORG_ID = '00000000-0000-0000-0000-000000000000';

interface PageProps {
  searchParams: {
    locale?: string;
    frameworks?: string;
    theme?: string;
    host?: string;
  };
}

/**
 * Standalone, no-chrome version of the audit form for cross-origin
 * iframe embedding via /widget.js. Reads its options from query params,
 * not from a layout context.
 *
 * No header, no footer, no language selector — the embedding site owns
 * its UX. We post our scrolling height to the parent so widget.js can
 * resize the iframe without scrollbars.
 */
export default async function EmbedAuditPage({ searchParams }: PageProps) {
  const locale = isNativeLocale(searchParams.locale ?? '') ? searchParams.locale! : DEFAULT_LOCALE;
  unstable_setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'audit' });
  const messages = await getMessages({ locale });
  const descriptor = getLocaleDescriptor(locale);

  // Optional pre-selection of frameworks via the script tag's data attribute.
  const preselect = (searchParams.frameworks ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is FrameworkId => FRAMEWORKS.some((f) => f.id === s));

  const isDark = searchParams.theme === 'dark';

  return (
    <html lang={descriptor.code} dir={descriptor.direction} className={isDark ? 'dark' : ''}>
      <body className="bg-background text-foreground antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <main className="mx-auto max-w-2xl p-6">
            <header className="mb-6">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                LexyFlow
              </div>
              <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight">
                {t('upload')}
              </h1>
              <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                {t('zeroKnowledge')}
              </p>
            </header>

            <AuditForm
              labels={{
                upload: t('upload'),
                uploadHint: t('uploadHint'),
                targetLanguage: t('targetLanguage'),
                targetLanguageHint: t('targetLanguageHint'),
                framework: t('framework'),
                submit: t('submit'),
                running: t('running')
              }}
              frameworks={
                preselect.length > 0
                  ? FRAMEWORKS.filter((f) => preselect.includes(f.id)).map((f) => ({ id: f.id, name: f.name }))
                  : FRAMEWORKS.map((f) => ({ id: f.id, name: f.name }))
              }
              defaultLanguage={locale}
              organizationId={ANONYMOUS_ORG_ID}
            />

            <EmbedAutosize />
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
