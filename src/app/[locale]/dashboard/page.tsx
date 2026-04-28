import { ArrowUpRight, FileText, ShieldAlert } from 'lucide-react';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { ManageBillingButton } from '@/components/ManageBillingButton';
import { SignOutButton } from '@/components/SignOutButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FRAMEWORKS, type FrameworkId } from '@/lib/legal-frameworks';
import { createSupabaseServerClient, getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Dashboard — LexyFlow',
  robots: { index: false, follow: false }
};

interface PageProps {
  params: { locale: string };
  searchParams: { framework?: string };
}

interface AuditRow {
  id: string;
  document_hash: string | null;
  frameworks: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  risk_score: number | null;
  summary: string | null;
  language: string;
  created_at: string;
  completed_at: string | null;
}

export default async function DashboardPage({
  params: { locale },
  searchParams
}: PageProps) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('dashboard');

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/${locale}/login?next=/${locale}/dashboard`);
  }
  if (!organizationIdFromUser(user)) {
    redirect(`/${locale}/onboarding`);
  }

  const supabase = createSupabaseServerClient();
  const filterFramework = searchParams.framework;

  let query = supabase
    .from('audits')
    .select('id,document_hash,frameworks,status,risk_score,summary,language,created_at,completed_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (filterFramework && FRAMEWORKS.some((f) => f.id === filterFramework)) {
    query = query.contains('frameworks', [filterFramework]);
  }

  const { data: audits } = await query;
  const rows: AuditRow[] = (audits ?? []) as AuditRow[];

  return (
    <div className="py-12">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-1 text-pretty text-muted-foreground">
            {t.rich('signedInAs', {
              email: () => <span className="font-medium text-foreground">{user.email}</span>
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/audit">{t('newAudit')}</Link>
          </Button>
          <ManageBillingButton />
          <SignOutButton />
        </div>
      </header>

      <FrameworkFilter active={filterFramework ?? null} locale={locale} allLabel={t('filterAll')} />

      {rows.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          body={t('emptyBody')}
          cta={t('emptyCta')}
        />
      ) : (
        <ul className="mt-8 grid gap-3">
          {rows.map((audit) => (
            <li key={audit.id}>
              <Link href={`/dashboard/${audit.id}`} className="block group">
                <Card className="transition-colors group-hover:border-foreground/30">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                        <CardTitle className="text-base font-medium">
                          {t('auditAt', { date: new Date(audit.created_at).toLocaleString(locale) })}
                        </CardTitle>
                      </div>
                      <RiskBadge
                        score={audit.risk_score}
                        status={audit.status}
                        runningLabel={t('running')}
                        failedLabel={t('failed')}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    {audit.summary && (
                      <CardDescription className="line-clamp-2 text-pretty">
                        {audit.summary}
                      </CardDescription>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {audit.frameworks.map((id) => (
                        <Badge key={id} variant="outline" className="text-xs uppercase">
                          {id.replace('_', ' ')}
                        </Badge>
                      ))}
                      <span className="ms-auto inline-flex items-center text-xs text-muted-foreground group-hover:text-foreground">
                        {t('openAudit')}
                        <ArrowUpRight className="ms-1 h-3.5 w-3.5" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FrameworkFilter({
  active,
  locale,
  allLabel
}: {
  active: string | null;
  locale: string;
  allLabel: string;
}) {
  const items: Array<{ id: FrameworkId | 'all'; label: string }> = [
    { id: 'all', label: allLabel },
    ...FRAMEWORKS.map((f) => ({ id: f.id, label: f.name.split(' ')[0] ?? f.id }))
  ];
  return (
    <nav className="-mx-2 flex flex-wrap gap-1">
      {items.map((item) => {
        const isActive = (item.id === 'all' && !active) || item.id === active;
        const href =
          item.id === 'all'
            ? `/${locale}/dashboard`
            : `/${locale}/dashboard?framework=${item.id}`;
        return (
          <a
            key={item.id}
            href={href}
            className={
              'rounded-md px-3 py-1.5 text-sm transition-colors ' +
              (isActive
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground')
            }
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

function RiskBadge({
  score,
  status,
  runningLabel,
  failedLabel
}: {
  score: number | null;
  status: AuditRow['status'];
  runningLabel: string;
  failedLabel: string;
}) {
  if (status === 'pending' || status === 'running') {
    return <Badge variant="secondary">{runningLabel}</Badge>;
  }
  if (status === 'failed') {
    return <Badge variant="destructive">{failedLabel}</Badge>;
  }
  if (score === null) return null;
  if (score >= 70) return <Badge variant="destructive">{score}/100</Badge>;
  if (score >= 40) return <Badge variant="secondary">{score}/100</Badge>;
  return <Badge variant="outline">{score}/100</Badge>;
}

function EmptyState({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <div className="mt-12 rounded-lg border bg-muted/30 p-12 text-center">
      <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
      <h2 className="mt-3 text-lg font-medium">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <Button asChild className="mt-5">
        <Link href="/audit">{cta}</Link>
      </Button>
    </div>
  );
}
