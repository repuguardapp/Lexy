import type { ReactNode } from 'react';

/**
 * Shared layout for /privacy, /terms, /dpa. Reading-optimised typography:
 * narrow measure, generous leading, monochrome.
 */
export function LegalShell({
  title,
  effective,
  children
}: {
  title: string;
  effective: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl py-16">
      <header className="border-b pb-6">
        <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Effective {effective} · LexyFlow ·{' '}
          <a href="mailto:legal@lexyflow.com" className="hover:underline">
            legal@lexyflow.com
          </a>
        </p>
      </header>
      <div className="mt-8 space-y-6 text-pretty leading-relaxed text-foreground [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:ps-6 [&_li]:mt-1 [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold">
        {children}
      </div>
    </article>
  );
}
