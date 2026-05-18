import { ArrowLeft, FileText, KeyRound, Trash2 } from 'lucide-react';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabaseService } from '@/lib/supabase';
import { getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Activité de sécurité — LexyFlow',
  robots: { index: false, follow: false }
};

interface PageProps {
  params: { locale: string };
}

interface AccessLogRow {
  id: string;
  action: 'audit_created' | 'document_decrypted' | 'audit_deleted';
  audit_id: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

interface DeletionLogRow {
  id: string;
  audit_id_hash: string;
  deleted_at: string;
  ip: string | null;
  receipt_signature: string;
}

const ROW_LIMIT = 200;

/**
 * Trust ledger — the customer's view of every plaintext access on
 * their data. Reads from data_access_log (RLS-scoped to the user's
 * organization). Anonymous-org accounts can't reach this page since
 * they have no auth context to authenticate against.
 */
export default async function SecurityActivityPage({ params }: PageProps) {
  unstable_setRequestLocale(params.locale);
  const t = await getTranslations('security');

  const user = await getCurrentUser();
  if (!user) redirect(`/${params.locale}/login?next=/${params.locale}/dashboard/security`);

  const orgId = organizationIdFromUser(user);
  if (!orgId) redirect(`/${params.locale}/onboarding`);

  const db = supabaseService();
  const [{ data: accessRows }, { data: deletionRows }] = await Promise.all([
    db
      .from('data_access_log')
      .select('id,action,audit_id,ip,user_agent,created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(ROW_LIMIT),
    db
      .from('deletion_log')
      .select('id,audit_id_hash,deleted_at,ip,receipt_signature')
      .eq('organization_id', orgId)
      .order('deleted_at', { ascending: false })
      .limit(50)
  ]);

  const access = (accessRows ?? []) as AccessLogRow[];
  const deletions = (deletionRows ?? []) as DeletionLogRow[];

  return (
    <div className="py-12">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="-ms-3">
          <Link href="/dashboard">
            <ArrowLeft className="me-2 h-4 w-4 rtl:-scale-x-100" />
            {t('back')}
          </Link>
        </Button>
      </div>

      <header className="mb-8 grid gap-2">
        <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">{t('title')}</h1>
        <p className="text-pretty text-muted-foreground">{t('intro')}</p>
      </header>

      <section className="grid gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('accessSectionTitle')} ({access.length})
        </h2>
        {access.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('accessEmpty')}</p>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border text-sm">
                {access.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <AccessIcon action={row.action} />
                    <div className="grid flex-1 gap-0.5">
                      <span className="font-medium">{t(`action.${row.action}`)}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(row.created_at).toLocaleString(params.locale)}
                        {row.ip ? ` · IP ${row.ip}` : ''}
                        {row.audit_id ? ` · audit ${row.audit_id.slice(0, 8)}` : ''}
                      </span>
                    </div>
                    {row.audit_id && row.action !== 'audit_deleted' && (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/dashboard/${row.audit_id}`}>{t('openAudit')}</Link>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      {deletions.length > 0 && (
        <section className="mt-10 grid gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('deletionSectionTitle')} ({deletions.length})
          </h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border text-sm">
                {deletions.map((row) => (
                  <li key={row.id} className="grid gap-1 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span className="font-medium">{t('deletedAuditLabel')}</span>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        sha256:{row.audit_id_hash.slice(0, 12)}…
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(row.deleted_at).toLocaleString(params.locale)}
                      {row.ip ? ` · IP ${row.ip}` : ''}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground" title={row.receipt_signature}>
                      {t('signaturePrefix')}: {row.receipt_signature.slice(0, 32)}…
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      <section className="mt-12">
        <Card className="border-emerald-200/60 bg-emerald-50/40 dark:bg-emerald-950/10">
          <CardHeader>
            <CardTitle className="text-base">{t('promiseTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-pretty">
            <p>{t('promiseBody')}</p>
            <p>
              <Link href="/trust" className="underline">
                {t('trustCenterLink')}
              </Link>
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function AccessIcon({ action }: { action: AccessLogRow['action'] }) {
  if (action === 'document_decrypted') return <KeyRound className="h-4 w-4 text-emerald-600" aria-hidden />;
  if (action === 'audit_deleted') return <Trash2 className="h-4 w-4 text-destructive" aria-hidden />;
  return <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />;
}
