import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { unstable_setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buildHreflangAlternates } from '@/lib/hreflang';
import { DATA_CATEGORY_LABEL, SUB_PROCESSORS } from '@/lib/sub-processors';

interface PageProps {
  params: { locale: string };
}

export async function generateMetadata({ params }: PageProps) {
  unstable_setRequestLocale(params.locale);
  const alternates = await buildHreflangAlternates('/integrations');
  return {
    title: 'Integrations & sub-processors — LexyFlow',
    description:
      'Every third party LexyFlow uses, what data we send them, where they sit, and which compliance certifications they hold.',
    alternates: { canonical: `/${params.locale}/integrations`, languages: alternates }
  };
}

export default async function IntegrationsPage({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);

  return (
    <div className="mx-auto max-w-5xl py-16">
      <header className="grid gap-3">
        <Badge variant="outline" className="w-fit">For procurement teams</Badge>
        <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Integrations &amp; sub-processors
        </h1>
        <p className="max-w-3xl text-pretty text-lg text-muted-foreground">
          LexyFlow runs on a small, deliberate set of providers. We list every
          one of them publicly with the data we share, the region where it
          lives, and the compliance certifications they hold. Procurement
          teams can use this page as part of their vendor-risk review.
        </p>
        <p className="text-sm text-muted-foreground">
          See also: <a href={`/${locale}/privacy`} className="underline underline-offset-2">Privacy Policy</a>{' '}
          · <a href={`/${locale}/dpa`} className="underline underline-offset-2">Data Processing Agreement</a>{' '}
          · <a href={`/${locale}/terms`} className="underline underline-offset-2">Terms</a>
        </p>
      </header>

      <section className="mt-12 rounded-lg border bg-muted/40 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          <span className="text-sm font-medium">Zero-Knowledge guarantee</span>
        </div>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          Source documents are wiped from memory immediately after the audit
          completes. Only the AI-authored report and a SHA-256 hash of the
          source are persisted. Sub-processors below receive only the data
          listed in their card — never your account credentials, never your
          billing data unless they are billing-specific, never anything we
          have not explicitly committed to.
        </p>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {SUB_PROCESSORS.map((sp) => (
          <Card key={sp.name} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{sp.name}</CardTitle>
                  <CardDescription>
                    {sp.role} · <span className="font-mono text-xs">{sp.legalName}</span>
                  </CardDescription>
                </div>
                <a
                  href={sp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`${sp.name} website`}
                >
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4 text-sm">
              <p className="text-pretty text-muted-foreground">{sp.purpose}</p>

              <DetailRow label="Region">{sp.region}</DetailRow>
              <DetailRow label="Data shared">
                <div className="flex flex-wrap gap-1">
                  {sp.dataCategories.map((d) => (
                    <Badge key={d} variant="secondary" className="text-xs">
                      {DATA_CATEGORY_LABEL[d]}
                    </Badge>
                  ))}
                </div>
              </DetailRow>
              <DetailRow label="Certifications">
                <div className="flex flex-wrap gap-1">
                  {sp.certifications.map((c) => (
                    <Badge key={c} variant="outline" className="text-xs">
                      {c}
                    </Badge>
                  ))}
                </div>
              </DetailRow>
              {sp.transferMechanism && (
                <DetailRow label="Cross-border transfers">{sp.transferMechanism}</DetailRow>
              )}
              {sp.dpaUrl && (
                <DetailRow label="DPA">
                  <a href={sp.dpaUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                    Provider DPA →
                  </a>
                </DetailRow>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-12 rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground">
        <p>
          We give 30 days&apos; notice before adding a new sub-processor.
          Customers may object on reasonable grounds and, failing
          resolution, terminate without penalty under section 4 of the DPA.
        </p>
        <p className="mt-2">
          Questions? <a href="mailto:legal@lexyflow.com" className="underline underline-offset-2">legal@lexyflow.com</a>
        </p>
      </section>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-baseline gap-3">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  );
}
