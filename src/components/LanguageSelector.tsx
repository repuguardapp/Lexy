'use client';

import { Globe } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { NATIVE_LOCALES } from '@/i18n/locales';
import { cn } from '@/lib/utils';

/**
 * Native-language selector.
 *
 * Why a native `<select>` instead of a popover:
 *  - renders correctly in every locale (incl. JP and RTL);
 *  - works with screen readers / platform autofill out of the box;
 *  - stays a single render path on Edge.
 *
 * Each option shows the locale's endonym so users find their language
 * even if they cannot read the current UI.
 */
export function LanguageSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const current = useLocale();
  const [isPending, startTransition] = useTransition();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <label className="relative inline-flex items-center gap-2 text-sm">
      <span className="sr-only">Language</span>
      <Globe className="pointer-events-none absolute start-2 h-4 w-4 text-muted-foreground" aria-hidden />
      <select
        value={current}
        onChange={onChange}
        disabled={isPending}
        className={cn(
          'h-9 appearance-none rounded-md border border-input bg-background ps-8 pe-3 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        {NATIVE_LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.endonym}
          </option>
        ))}
      </select>
    </label>
  );
}
