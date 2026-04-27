'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FrameworkOption {
  id: string;
  name: string;
}

interface Labels {
  upload: string;
  uploadHint: string;
  targetLanguage: string;
  targetLanguageHint: string;
  framework: string;
  submit: string;
  running: string;
}

interface Props {
  labels: Labels;
  frameworks: FrameworkOption[];
  defaultLanguage: string;
}

/**
 * Audit form. Posts multipart/form-data to /api/audit so the file never
 * touches localStorage / sessionStorage / IndexedDB. The browser hands the
 * blob to the server and forgets about it.
 */
export function AuditForm({ labels, frameworks, defaultLanguage }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch('/api/audit', { method: 'POST', body: form });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error ?? 'audit_failed');
      }
      const { auditId } = await res.json();
      window.location.assign(`./audit/${auditId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background';

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      <Field label={labels.upload} hint={labels.uploadHint}>
        <input
          type="file"
          name="document"
          required
          accept=".pdf,.docx,.md,.txt"
          className={cn(inputClass, 'file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:font-medium')}
        />
      </Field>

      <Field label={labels.framework}>
        <select
          name="frameworks"
          required
          multiple
          className={cn(inputClass, 'min-h-[8rem]')}
        >
          {frameworks.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label={labels.targetLanguage} hint={labels.targetLanguageHint}>
        <input
          type="text"
          name="targetLanguage"
          required
          defaultValue={defaultLanguage}
          placeholder="en, fr, ja, ar, vi…"
          className={inputClass}
        />
      </Field>

      <input type="hidden" name="organizationId" value="00000000-0000-0000-0000-000000000000" />

      <Button type="submit" disabled={submitting} size="lg" className="w-full sm:w-auto">
        {submitting ? labels.running : labels.submit}
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
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
