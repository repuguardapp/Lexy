import { ShieldCheck } from 'lucide-react';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { AuditForm } from '@/components/AuditForm';
import { FRAMEWORKS } from '@/lib/legal-frameworks';

interface PageProps {
  params: { locale: string };
}

export default async function AuditPage({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('audit');

  return (
    <div className="mx-auto grid max-w-2xl gap-10 py-16">
      <header className="grid gap-2">
        <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          {t('upload')}
        </h1>
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" aria-hidden />
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
        frameworks={FRAMEWORKS.map((f) => ({ id: f.id, name: f.name }))}
        defaultLanguage={locale}
      />
    </div>
  );
}
