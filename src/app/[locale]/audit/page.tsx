import { ShieldCheck } from 'lucide-react';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { AuditForm } from '@/components/AuditForm';
import { buildAuditFormLabels } from '@/lib/audit-labels';
import { FRAMEWORKS } from '@/lib/legal-frameworks';
import { getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { locale: string };
}

// Anonymous-friendly fallback so the audit page also works for the trial
// flow on the marketing site. Real users get their stamped org id.
const ANONYMOUS_ORG_ID = '00000000-0000-0000-0000-000000000000';

export default async function AuditPage({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('audit');

  const user = await getCurrentUser();
  const orgId = (user && organizationIdFromUser(user)) ?? ANONYMOUS_ORG_ID;

  return (
    <div className="mx-auto grid max-w-2xl gap-10 px-4 py-16 md:px-0">
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
        labels={buildAuditFormLabels(t)}
        frameworks={FRAMEWORKS.map((f) => ({ id: f.id, name: f.name }))}
        defaultLanguage={locale}
        organizationId={orgId}
      />
    </div>
  );
}
