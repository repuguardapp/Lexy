import { unstable_setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ENDPOINTS, type ApiEndpoint, type Stability } from '@/lib/api-manifest';
import { buildHreflangAlternates } from '@/lib/hreflang';

interface PageProps {
  params: { locale: string };
}

export async function generateMetadata({ params }: PageProps) {
  unstable_setRequestLocale(params.locale);
  const alternates = await buildHreflangAlternates('/docs/api');
  return {
    title: 'API reference — LexyFlow',
    alternates: { canonical: `/${params.locale}/docs/api`, languages: alternates }
  };
}

export default async function ApiDocsPage({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);

  return (
    <div className="mx-auto max-w-4xl py-16">
      <header className="grid gap-2">
        <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          API reference
        </h1>
        <p className="text-pretty text-lg text-muted-foreground">
          Every LexyFlow endpoint, with its inputs, outputs and rate limits.
          Schemas are derived from the same Zod definitions that validate
          requests in production.
        </p>
      </header>

      <nav className="mt-10 grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-4 text-sm md:grid-cols-3">
        {ENDPOINTS.map((e) => (
          <a key={e.path + e.method} href={`#${anchor(e)}`} className="hover:underline">
            <span className="me-2 font-mono text-xs text-muted-foreground">{e.method}</span>
            {e.path}
          </a>
        ))}
      </nav>

      <div className="mt-12 grid gap-8">
        {ENDPOINTS.map((endpoint) => (
          <EndpointCard key={endpoint.path + endpoint.method} endpoint={endpoint} />
        ))}
      </div>
    </div>
  );
}

function EndpointCard({ endpoint }: { endpoint: ApiEndpoint }) {
  return (
    <Card id={anchor(endpoint)} className="scroll-mt-20">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs uppercase">
            {endpoint.method}
          </Badge>
          <code className="text-sm font-medium">{endpoint.path}</code>
          <StabilityBadge stability={endpoint.stability} />
          <AuthBadge auth={endpoint.auth} />
          {endpoint.rateLimit && (
            <span className="text-xs text-muted-foreground">· {endpoint.rateLimit}</span>
          )}
        </div>
        <CardTitle className="pt-2 text-lg">{endpoint.summary}</CardTitle>
        <CardDescription className="text-pretty">{endpoint.description}</CardDescription>
      </CardHeader>

      {endpoint.requestBody && (
        <CardContent className="grid gap-3 border-t pt-4">
          <Section title={`Request — ${endpoint.requestBody.contentType}`}>
            <ul className="grid gap-2">
              {endpoint.requestBody.fields.map((f) => (
                <li key={f.name} className="grid grid-cols-[120px_1fr] items-baseline gap-3 text-sm">
                  <code className="font-medium">
                    {f.name}
                    {f.required ? '' : '?'}
                  </code>
                  <div>
                    <span className="font-mono text-xs text-muted-foreground">{f.type}</span>
                    <span className="ms-2 text-muted-foreground">{f.description}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </CardContent>
      )}

      <CardContent className="grid gap-4 border-t pt-4">
        <Section title="Response">
          <div className="grid gap-2 text-sm">
            <div>
              <Badge className="me-2 bg-green-600 text-white">{endpoint.response.success.status}</Badge>
              {endpoint.response.success.description}
            </div>
            {endpoint.response.success.example && (
              <pre className="mt-2 overflow-x-auto rounded-md border bg-muted/50 p-3 text-xs">
                {JSON.stringify(endpoint.response.success.example, null, 2)}
              </pre>
            )}
            {endpoint.response.errors.length > 0 && (
              <ul className="mt-2 grid gap-1 text-sm">
                {endpoint.response.errors.map((e) => (
                  <li key={`${e.status}-${e.code}`} className="flex flex-wrap items-baseline gap-2">
                    <Badge variant="secondary" className="font-mono text-xs">{e.status}</Badge>
                    <code className="text-xs">{e.code}</code>
                    <span className="text-muted-foreground">{e.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function StabilityBadge({ stability }: { stability: Stability }) {
  if (stability === 'stable') return <Badge variant="secondary" className="text-xs">stable</Badge>;
  if (stability === 'beta')   return <Badge className="bg-orange-500 text-white text-xs">beta</Badge>;
  return <Badge variant="outline" className="text-xs">internal</Badge>;
}

function AuthBadge({ auth }: { auth: ApiEndpoint['auth'] }) {
  if (auth === 'none')             return <Badge variant="outline" className="text-xs">public</Badge>;
  if (auth === 'cookie')           return <Badge variant="outline" className="text-xs">session cookie</Badge>;
  return <Badge variant="outline" className="text-xs">stripe-signature</Badge>;
}

function anchor(e: ApiEndpoint): string {
  return `${e.method.toLowerCase()}-${e.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`;
}
