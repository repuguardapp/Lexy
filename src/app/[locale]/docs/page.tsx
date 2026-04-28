import { Book, Code, Globe, Languages, ShieldCheck } from 'lucide-react';
import { unstable_setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buildHreflangAlternates } from '@/lib/hreflang';

interface PageProps {
  params: { locale: string };
}

export async function generateMetadata({ params }: PageProps) {
  unstable_setRequestLocale(params.locale);
  const alternates = await buildHreflangAlternates('/docs');
  return {
    title: 'Documentation — LexyFlow',
    alternates: { canonical: `/${params.locale}/docs`, languages: alternates }
  };
}

const sections = [
  {
    icon: Book,
    title: 'Getting started',
    description: 'Run your first audit in under 60 seconds. No account required for the trial.',
    href: '/audit'
  },
  {
    icon: Languages,
    title: 'Multi-Pass engine',
    description: 'How LexyFlow audits in a pivot language and localizes findings to any BCP-47 target.',
    href: '/docs#multi-pass'
  },
  {
    icon: ShieldCheck,
    title: 'Zero-Knowledge',
    description: 'Why your source documents never touch our disk and how we prove it.',
    href: '/docs#zero-knowledge'
  },
  {
    icon: Globe,
    title: 'Internationalisation',
    description: '6 native locales, dynamic discovery for any 7th language. RTL ready.',
    href: '/docs#i18n'
  },
  {
    icon: Code,
    title: 'API & webhooks',
    description: 'Programmatic audits, signed webhook delivery, idempotency keys. (Q3 roadmap.)',
    href: '/docs#api'
  }
];

export default async function DocsPage({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);

  return (
    <div className="mx-auto max-w-4xl py-16">
      <header className="grid gap-2">
        <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Documentation
        </h1>
        <p className="text-pretty text-lg text-muted-foreground">
          Everything you need to integrate LexyFlow into your compliance workflow.
        </p>
      </header>

      <section className="mt-12 grid gap-4 md:grid-cols-2">
        {sections.map(({ icon: Icon, title, description, href }) => (
          <Link key={title} href={href} className="group">
            <Card className="h-full transition-all hover:border-foreground/20 hover:shadow-md">
              <CardHeader>
                <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <CardTitle className="pt-2 group-hover:underline">{title}</CardTitle>
                <CardDescription className="text-pretty">{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>

      <section className="mt-16 rounded-lg border bg-muted/40 p-6 text-center">
        <p className="text-pretty text-sm text-muted-foreground">
          Full reference documentation is being written.
          For now, the source of truth is the README and inline JSDoc comments at{' '}
          <a
            href="https://github.com/repuguardapp/Lexy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground hover:underline"
          >
            github.com/repuguardapp/Lexy
          </a>.
        </p>
      </section>
    </div>
  );
}
