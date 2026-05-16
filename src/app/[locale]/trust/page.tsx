import { CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SUB_PROCESSORS } from '@/lib/sub-processors';

export const metadata = {
  title: 'Trust Center — LexyFlow',
  description:
    'Sécurité, chiffrement, sous-traitants et engagements de confidentialité de LexyFlow. Tout ce que votre équipe juridique doit savoir.'
};

interface PageProps {
  params: { locale: string };
}

/**
 * Public Trust Center. Single URL we hand to Enterprise buyers when
 * their legal team asks "where can I see your security posture and
 * sub-processors?" — replaces the typical 12-email back-and-forth.
 *
 * Pulls the sub-processor list from src/lib/sub-processors.ts, the
 * single source of truth that the audit pipeline references too.
 * Adding a sub-processor anywhere means it shows up here within one
 * deploy.
 */
export default async function TrustPage({ params }: PageProps) {
  unstable_setRequestLocale(params.locale);
  const t = await getTranslations('trust');

  return (
    <div className="py-12">
      <header className="mb-10 grid gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-emerald-600" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            {t('eyebrow')}
          </span>
        </div>
        <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">{t('title')}</h1>
        <p className="text-pretty text-lg text-muted-foreground">{t('intro')}</p>
      </header>

      <section className="grid gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('encryptionTitle')}
        </h2>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-emerald-600" aria-hidden />
              <CardTitle className="text-base">{t('encryptionCardTitle')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <ul className="grid gap-2">
              <li>
                <strong>{t('encryptionAlgoLabel')}:</strong> AES-256-GCM (NIST SP 800-38D)
              </li>
              <li>
                <strong>{t('encryptionIvLabel')}:</strong> {t('encryptionIvBody')}
              </li>
              <li>
                <strong>{t('encryptionTagLabel')}:</strong> {t('encryptionTagBody')}
              </li>
              <li>
                <strong>{t('encryptionKeyLabel')}:</strong> {t('encryptionKeyBody')}
              </li>
              <li>
                <strong>{t('encryptionAccessLabel')}:</strong> {t('encryptionAccessBody')}
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="mt-10 grid gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('subProcessorsTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('subProcessorsIntro')}</p>
        <div className="grid gap-3">
          {SUB_PROCESSORS.map((p) => (
            <Card key={p.legalName}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <CardTitle className="text-base">
                    {p.name} <span className="text-xs font-normal text-muted-foreground">— {p.legalName}</span>
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    {p.region}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{p.role}</p>
              </CardHeader>
              <CardContent className="grid gap-2 text-xs">
                <p className="text-pretty">{p.purpose}</p>
                <div className="flex flex-wrap gap-1">
                  {p.certifications.map((c) => (
                    <Badge key={c} variant="secondary" className="text-[10px]">
                      <CheckCircle2 className="me-1 h-3 w-3" aria-hidden />
                      {c}
                    </Badge>
                  ))}
                </div>
                {p.transferMechanism && (
                  <p className="text-muted-foreground">
                    <strong>{t('transferMechanismLabel')}:</strong> {p.transferMechanism}
                  </p>
                )}
                <div className="flex flex-wrap gap-3 pt-1">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline">
                    {t('websiteLink')}
                  </a>
                  {p.dpaUrl && (
                    <a href={p.dpaUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      {t('dpaLink')}
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('commitmentsTitle')}
        </h2>
        <Card>
          <CardContent className="grid gap-3 pt-6 text-sm">
            <Commitment label={t('commit30dLabel')}>{t('commit30dBody')}</Commitment>
            <Commitment label={t('commitDeleteLabel')}>{t('commitDeleteBody')}</Commitment>
            <Commitment label={t('commitTrainingLabel')}>{t('commitTrainingBody')}</Commitment>
            <Commitment label={t('commitBreachLabel')}>{t('commitBreachBody')}</Commitment>
          </CardContent>
        </Card>
      </section>

      <section className="mt-10 grid gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('contactTitle')}
        </h2>
        <Card>
          <CardContent className="grid gap-2 pt-6 text-sm">
            <p>
              <strong>{t('contactSecurityLabel')}:</strong>{' '}
              <a href="mailto:security@lexyflow.com" className="underline">
                security@lexyflow.com
              </a>
            </p>
            <p>
              <strong>{t('contactDpoLabel')}:</strong>{' '}
              <a href="mailto:privacy@lexyflow.com" className="underline">
                privacy@lexyflow.com
              </a>
            </p>
            <p className="text-xs text-muted-foreground">
              <a href="/.well-known/security.txt" className="underline">
                /.well-known/security.txt
              </a>{' '}
              · {t('responsibleDisclosure')}
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Commitment({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
        <strong className="text-sm">{label}</strong>
      </div>
      <p className="ps-6 text-pretty text-muted-foreground">{children}</p>
    </div>
  );
}
