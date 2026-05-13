'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { NATIVE_LOCALES } from '@/i18n/locales';

const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'IE', name: 'Ireland' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CA', name: 'Canada' },
  { code: 'BR', name: 'Brazil' },
  { code: 'JP', name: 'Japan' }
];

/**
 * All UX strings the form renders. Built server-side by the onboarding
 * page and passed in as a single object — keeps the client bundle free
 * of next-intl and lets the same component ship to every locale without
 * branching.
 */
export interface OnboardingLabels {
  /** Raw ICU template with `<bold>{email}</bold>` — rendered locally. */
  signedInAsTemplate: string;
  orgName: string;
  orgNamePlaceholder: string;
  country: string;
  countryHint: string;
  uiLocale: string;
  reportLanguage: string;
  reportLanguageHint: string;
  reportLanguagePlaceholder: string;
  submit: string;
  submitting: string;
}

interface Props {
  locale: string;
  userEmail: string;
  labels: OnboardingLabels;
}

/**
 * Render the signedInAs template manually. The string looks like
 *   "Connecté en tant que <bold>{email}</bold>."
 * We don't import next-intl on the client just for this single string —
 * a single regex split + email substitution is enough.
 */
function renderSignedInAs(template: string, email: string) {
  const withEmail = template.replace('{email}', email);
  // Split on <bold>…</bold>. The result is [pre, inner, post].
  const m = withEmail.match(/^(.*?)<bold>(.*?)<\/bold>(.*)$/s);
  if (!m) return <>{withEmail}</>;
  const [, pre, inner, post] = m;
  return (
    <>
      {pre}
      <span className="font-medium text-foreground">{inner}</span>
      {post}
    </>
  );
}

export function OnboardingForm({ locale, userEmail, labels }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          country: data.get('country'),
          uiLocale: data.get('uiLocale') ?? locale,
          defaultReportLanguage: data.get('defaultReportLanguage') ?? locale
        })
      });
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({}));
        throw new Error(detail ?? 'onboarding_failed');
      }
      // Hard redirect — the JWT must be re-fetched so RLS sees the new
      // organization_id stamp before the dashboard query runs.
      window.location.assign(`/${locale}/dashboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  const inputClass =
    'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        {renderSignedInAs(labels.signedInAsTemplate, userEmail)}
      </p>

      <Field label={labels.orgName}>
        <input
          name="name"
          required
          minLength={2}
          maxLength={120}
          autoComplete="organization"
          placeholder={labels.orgNamePlaceholder}
          className={inputClass}
        />
      </Field>

      <Field label={labels.country} hint={labels.countryHint}>
        <select name="country" defaultValue="FR" required className={inputClass}>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label={labels.uiLocale}>
        <select name="uiLocale" defaultValue={locale} className={inputClass}>
          {NATIVE_LOCALES.map((l) => (
            <option key={l.code} value={l.code} lang={l.code}>
              {l.endonym}
            </option>
          ))}
        </select>
      </Field>

      <Field label={labels.reportLanguage} hint={labels.reportLanguageHint}>
        <input
          name="defaultReportLanguage"
          required
          defaultValue={locale}
          placeholder={labels.reportLanguagePlaceholder}
          className={inputClass}
        />
      </Field>

      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? labels.submitting : labels.submit}
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
