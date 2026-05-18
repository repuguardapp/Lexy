import { AlertTriangle, ArrowLeft, CheckCircle2, FileWarning, Info, Lock, Pencil, Sparkles } from 'lucide-react';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { DeleteAuditButton } from '@/components/DeleteAuditButton';
import { PrintButton } from '@/components/PrintButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabaseService } from '@/lib/supabase';
import { createSupabaseServerClient, getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';
import { getTierForOrg } from '@/lib/tier';
import { NATIVE_LOCALE_CODES } from '@/i18n/locales';
import type { Severity } from '@/types/audit';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

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

interface AuditDetailRow {
  id: string;
  organization_id: string;
  document_hash: string | null;
  document_ciphertext: string | null;
  frameworks: string[];
  status: string;
  risk_score: number | null;
  summary: string | null;
  language: string;
  created_at: string;
  completed_at: string | null;
}

// The anonymous-org placeholder is what /audit (and the embed widget)
// stamps onto unauth runs — see src/app/[locale]/audit/page.tsx. Reports
// produced under this org are intentionally viewable by anyone holding
// the audit UUID: it is the equivalent of a Dropbox share link, and the
// UUID is unguessable. Auth is only enforced for reports owned by a
// real (paying) organization.
const ANONYMOUS_ORG_ID = '00000000-0000-0000-0000-000000000000';

export default async function AuditDetailPage({ params }: PageProps) {
  unstable_setRequestLocale(params.locale);
  const t = await getTranslations('report');

  const supabase = createSupabaseServerClient();

  const { data: audit } = await supabase
    .from('audits')
    .select('id,organization_id,document_hash,document_ciphertext,frameworks,status,risk_score,summary,language,created_at,completed_at')
    .eq('id', params.auditId)
    .maybeSingle();

  if (!audit) notFound();
  const a = audit as AuditDetailRow;

  // Chrome-content language alignment: when the report was generated
  // in a native locale we ship (a.language) but the URL was served
  // under a different locale (params.locale), the user sees report
  // body text in language X but every button, header and CTA in
  // language Y. The "Unlock the AI editor" → /<urlLocale>/pricing
  // mismatch is the most visible symptom. Server-redirect so the URL
  // always reflects the report's language.
  //
  // Exception: anonymous-org audits are share-link contracts. The
  // sharer's URL choice is intentional (a French CISO sharing a
  // demo with English colleagues uses /en/dashboard/<id> on purpose).
  // We don't second-guess the sharer.
  const auditLang = (a.language ?? '').toLowerCase();
  if (
    a.organization_id !== ANONYMOUS_ORG_ID &&
    auditLang &&
    auditLang !== params.locale &&
    (NATIVE_LOCALE_CODES as readonly string[]).includes(auditLang)
  ) {
    redirect(`/${auditLang}/dashboard/${params.auditId}`);
  }

  // Auth gate: anonymous-org reports are public-by-UUID; everything
  // else requires a logged-in user. We deliberately do not check that
  // the user owns the audit here — that's enforced by RLS at the
  // Supabase layer when we read the row above.
  //
  // Paywall logic (tier-aware): if the viewer is signed in, fetch
  // their tier so we can decide between full report and teaser view.
  // Anonymous-org audits are share-link contracts — never paywalled
  // regardless of viewer tier.
  let viewerTier: 'free' | 'paid' = 'paid';
  let viewerOwnsAudit = false;
  if (a.organization_id !== ANONYMOUS_ORG_ID) {
    const user = await getCurrentUser();
    if (!user) redirect(`/${params.locale}/login?next=/${params.locale}/dashboard/${params.auditId}`);
    viewerOwnsAudit = organizationIdFromUser(user) === a.organization_id;
    if (viewerOwnsAudit) {
      viewerTier = await getTierForOrg(supabaseService(), a.organization_id);
    }
  }
  const paywalled = a.organization_id !== ANONYMOUS_ORG_ID && viewerOwnsAudit && viewerTier === 'free';

  const { data: findings } = await supabase
    .from('audit_findings')
    .select('id,framework_id,citation,severity,title,body,recommendation,evidence')
    .eq('audit_id', params.auditId)
    .order('severity', { ascending: true });

  const allRows: FindingRow[] = (findings ?? []) as FindingRow[];
  // In paywall mode we only render the first finding in full; the
  // rest are surfaced as a count + locked CTA card. The full data
  // never reaches the client when paywalled — we slice server-side.
  const visibleRows: FindingRow[] = paywalled ? allRows.slice(0, 1) : allRows;
  const hiddenCount = paywalled ? Math.max(0, allRows.length - visibleRows.length) : 0;

  return (
    <div className="py-12 print:py-0">
      <div className="mb-8 flex items-center justify-between gap-4 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ms-3">
          <Link href="/dashboard">
            <ArrowLeft className="me-2 h-4 w-4 rtl:-scale-x-100" />
            {t('back')}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {paywalled ? (
            <Button asChild variant="default" size="sm">
              <Link href="/pricing">
                <Lock className="me-2 h-4 w-4" aria-hidden />
                {t('editLocked')}
              </Link>
            </Button>
          ) : (
            <Button asChild variant={a.document_ciphertext ? 'default' : 'outline'} size="sm">
              <Link href={`/dashboard/${params.auditId}/edit`}>
                <Pencil className="me-2 h-4 w-4" aria-hidden />
                {t('editDocument')}
              </Link>
            </Button>
          )}
          <PrintButton label={t('savePdf')} />
          {a.organization_id !== ANONYMOUS_ORG_ID && (
            <DeleteAuditButton
              auditId={params.auditId}
              locale={params.locale}
              labels={{
                cta: t('deleteCta'),
                confirm: t('deleteConfirm'),
                deleting: t('deleting'),
                success: t('deleteSuccess'),
                failed: t('deleteFailed')
              }}
            />
          )}
        </div>
      </div>

      <header className="grid gap-3 print:gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {a.frameworks.map((id) => (
            <Badge key={id} variant="outline" className="text-xs uppercase">
              {id.replace('_', ' ')}
            </Badge>
          ))}
          <Badge variant="secondary">{t('language')}: {a.language}</Badge>
          {a.document_ciphertext && (
            <Badge
              variant="outline"
              className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
              title={t('encryptedTooltip')}
            >
              <Lock className="h-3 w-3" aria-hidden />
              AES-256
            </Badge>
          )}
        </div>
        <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          {t('title')}
        </h1>
        <p className="text-pretty text-muted-foreground">
          {t('generatedOn', { date: new Date(a.created_at).toLocaleString(params.locale) })}
          {' '}
          {t('riskScore')}:{' '}
          <span className="font-semibold text-foreground">
            {a.risk_score ?? '—'} / 100
          </span>
        </p>
      </header>

      {a.summary && (
        <section className="mt-8 rounded-lg border bg-muted/40 p-5 print:bg-transparent">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('executiveSummary')}
          </div>
          <p className="text-pretty">{a.summary}</p>
        </section>
      )}

      <section className="mt-10 grid gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('findings')} ({allRows.length})
          </h2>
          {paywalled && allRows.length > 0 && (
            <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              <Lock className="h-3 w-3" aria-hidden />
              {t('paywallTeaserBadge')}
            </Badge>
          )}
        </div>
        {allRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noFindings')}</p>
        ) : (
          visibleRows.map((f) => (
            <Card key={f.id} className="break-inside-avoid">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <SeverityIcon severity={f.severity} />
                  <div className="grid flex-1 gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={f.severity === 'critical' ? 'destructive' : 'secondary'}>
                        {t(`severity.${f.severity}`)}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {f.citation}
                      </span>
                    </div>
                    <CardTitle className="text-base leading-tight">{f.title}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-pretty">{f.body}</p>
                {f.evidence && (
                  <blockquote className="border-s-2 border-muted-foreground/30 ps-3 italic text-muted-foreground">
                    &ldquo;{f.evidence}&rdquo;
                  </blockquote>
                )}
                <div className="rounded-md border bg-muted/50 p-3 print:bg-transparent">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('recommendation')}
                  </div>
                  <p className="mt-1 text-pretty">{f.recommendation}</p>
                </div>
              </CardContent>
            </Card>
          ))
        )}

        {paywalled && hiddenCount > 0 && (
          <Card className="border-2 border-dashed border-amber-300 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10 print:hidden">
            <CardHeader>
              <div className="flex items-start gap-3">
                <Lock className="mt-1 h-5 w-5 text-amber-600" aria-hidden />
                <div className="grid flex-1 gap-1">
                  <CardTitle className="text-base">
                    {t('paywallTitle', { count: hiddenCount })}
                  </CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <p className="text-pretty">{t('paywallBody')}</p>
              <ul className="grid gap-1.5 text-sm">
                <li className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" aria-hidden />
                  {t('paywallBenefit1', { count: hiddenCount })}
                </li>
                <li className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" aria-hidden />
                  {t('paywallBenefit2')}
                </li>
                <li className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" aria-hidden />
                  {t('paywallBenefit3')}
                </li>
              </ul>
              <Button asChild size="lg" className="w-full sm:w-auto sm:self-start">
                <Link href="/pricing">{t('paywallCta')}</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="mt-12 hidden print:block text-xs text-muted-foreground">
        {t('footer', { id: a.id })}
      </section>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === 'critical') return <AlertTriangle className="mt-1 h-5 w-5 text-destructive" />;
  if (severity === 'high')     return <FileWarning   className="mt-1 h-5 w-5 text-orange-500" />;
  if (severity === 'medium')   return <Info          className="mt-1 h-5 w-5 text-yellow-600" />;
  return <CheckCircle2 className="mt-1 h-5 w-5 text-muted-foreground" />;
}
