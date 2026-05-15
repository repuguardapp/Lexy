import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { DocumentEditor, type EditorFinding } from '@/components/DocumentEditor';
import { Button } from '@/components/ui/button';
import { createSupabaseServerClient, getCurrentUser } from '@/lib/supabase-server';
import type { Severity } from '@/types/audit';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Edit document — LexyFlow',
  robots: { index: false, follow: false }
};

interface PageProps {
  params: { locale: string; auditId: string };
}

interface FindingRow {
  id: string;
  framework_id: string;
  citation: string;
  severity: Severity;
  title: string;
  body: string;
  recommendation: string;
  evidence: string;
}

const ANONYMOUS_ORG_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Document editor — premium feature.
 *
 * Zero-Knowledge contract is preserved: the document was wiped at the
 * end of the original audit, so the editor asks the user to paste or
 * re-upload the source text. Findings come from the persisted audit;
 * AI rewrites are streamed back per-segment via /api/audit/[id]/rewrite
 * without anything being saved server-side.
 */
export default async function AuditEditPage({ params }: PageProps) {
  unstable_setRequestLocale(params.locale);
  const t = await getTranslations('editor');

  const supabase = createSupabaseServerClient();
  const { data: audit } = await supabase
    .from('audits')
    .select('id,organization_id,language,risk_score,summary,document_ciphertext')
    .eq('id', params.auditId)
    .maybeSingle();

  if (!audit) notFound();
  const a = audit as {
    id: string;
    organization_id: string;
    language: string;
    risk_score: number | null;
    summary: string | null;
    document_ciphertext: string | null;
  };
  const hasRetainedDocument = a.document_ciphertext !== null;

  if (a.organization_id !== ANONYMOUS_ORG_ID) {
    const user = await getCurrentUser();
    if (!user) redirect(`/${params.locale}/login?next=/${params.locale}/dashboard/${params.auditId}/edit`);
  }

  const { data: findings } = await supabase
    .from('audit_findings')
    .select('id,framework_id,citation,severity,title,body,recommendation,evidence')
    .eq('audit_id', params.auditId)
    .order('severity', { ascending: true });

  const rows: EditorFinding[] = ((findings ?? []) as FindingRow[]).map((f) => ({
    id: f.id,
    severity: f.severity,
    title: f.title,
    body: f.body,
    recommendation: f.recommendation,
    evidence: f.evidence,
    citation: f.citation
  }));

  return (
    <div className="py-12">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Button asChild variant="ghost" size="sm" className="-ms-3">
          <Link href={`/dashboard/${params.auditId}`}>{t('back')}</Link>
        </Button>
      </div>

      <header className="grid gap-2">
        <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          {t('title')}
        </h1>
        <p className="text-pretty text-muted-foreground">{t('intro')}</p>
      </header>

      <DocumentEditor
        auditId={params.auditId}
        targetLanguage={a.language}
        findings={rows}
        hasRetainedDocument={hasRetainedDocument}
        labels={{
          pasteLabel: t('pasteLabel'),
          pastePlaceholder: t('pastePlaceholder'),
          findingsTitle: t('findingsTitle'),
          rewriteCta: t('rewriteCta'),
          rewriting: t('rewriting'),
          applyCta: t('applyCta'),
          discardCta: t('discardCta'),
          downloadCta: t('downloadCta'),
          emptyDocument: t('emptyDocument'),
          rewriteError: t('rewriteError'),
          rewriteHint: t('rewriteHint'),
          loadingDocument: t('loadingDocument'),
          retainedNotice: t('retainedNotice')
        }}
      />
    </div>
  );
}
