import { AlertTriangle, ArrowLeft, CheckCircle2, FileWarning, Info } from 'lucide-react';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { PrintButton } from '@/components/PrintButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createSupabaseServerClient, getCurrentUser } from '@/lib/supabase-server';
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
  document_hash: string | null;
  frameworks: string[];
  status: string;
  risk_score: number | null;
  summary: string | null;
  language: string;
  created_at: string;
  completed_at: string | null;
}

export default async function AuditDetailPage({ params }: PageProps) {
  unstable_setRequestLocale(params.locale);
  const t = await getTranslations('report');

  const user = await getCurrentUser();
  if (!user) redirect(`/${params.locale}/login?next=/${params.locale}/dashboard/${params.auditId}`);

  const supabase = createSupabaseServerClient();

  const { data: audit } = await supabase
    .from('audits')
    .select('id,document_hash,frameworks,status,risk_score,summary,language,created_at,completed_at')
    .eq('id', params.auditId)
    .maybeSingle();

  if (!audit) notFound();
  const a = audit as AuditDetailRow;

  const { data: findings } = await supabase
    .from('audit_findings')
    .select('id,framework_id,citation,severity,title,body,recommendation,evidence')
    .eq('audit_id', params.auditId)
    .order('severity', { ascending: true });

  const rows: FindingRow[] = (findings ?? []) as FindingRow[];

  return (
    <div className="py-12 print:py-0">
      <div className="mb-8 flex items-center justify-between gap-4 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ms-3">
          <Link href="/dashboard">
            <ArrowLeft className="me-2 h-4 w-4" />
            {t('back')}
          </Link>
        </Button>
        <PrintButton label={t('savePdf')} />
      </div>

      <header className="grid gap-3 print:gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {a.frameworks.map((id) => (
            <Badge key={id} variant="outline" className="text-xs uppercase">
              {id.replace('_', ' ')}
            </Badge>
          ))}
          <Badge variant="secondary">{t('language')}: {a.language}</Badge>
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
            {t('findings')} ({rows.length})
          </h2>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noFindings')}</p>
        ) : (
          rows.map((f) => (
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
                  <blockquote className="border-l-2 border-muted-foreground/30 ps-3 italic text-muted-foreground">
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
