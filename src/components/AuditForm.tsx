'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
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
  /** Stamped from the server-rendered page so we don't trust the client. */
  organizationId: string;
}

type View =
  | { phase: 'idle' }
  | { phase: 'uploading' }
  | { phase: 'tracking'; auditId: string; status: AuditStatus; findingsCount: number; riskScore: number | null }
  | { phase: 'completed'; auditId: string; findingsCount: number; riskScore: number | null }
  | { phase: 'failed'; message: string };

type AuditStatus = 'pending' | 'running' | 'completed' | 'failed';

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS  = 5 * 60 * 1_000;

/**
 * Audit form + async progress UI.
 *
 * Always uses /api/audit/async — the form returns 202 with an audit id,
 * we then poll /api/audit/[id] until status flips to completed/failed.
 * This gives consistent UX whether the document is 1 KB or 25 MB.
 */
export function AuditForm({ labels, frameworks, defaultLanguage, organizationId }: Props) {
  const [view, setView] = useState<View>({ phase: 'idle' });

  if (view.phase === 'tracking' || view.phase === 'completed' || view.phase === 'failed') {
    return <ProgressPanel view={view} />;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setView({ phase: 'uploading' });

    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch('/api/audit/async', { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `audit_failed_${res.status}`);
      }
      const { auditId } = await res.json();
      setView({ phase: 'tracking', auditId, status: 'pending', findingsCount: 0, riskScore: null });
    } catch (err) {
      setView({ phase: 'failed', message: err instanceof Error ? err.message : String(err) });
    }
  }

  const inputClass =
    'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background';
  const submitting = view.phase === 'uploading';

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
        <select name="frameworks" required multiple className={cn(inputClass, 'min-h-[8rem]')}>
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

      <input type="hidden" name="organizationId" value={organizationId} />

      <Button type="submit" disabled={submitting} size="lg" className="w-full sm:w-auto">
        {submitting ? labels.running : labels.submit}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Progress panel                                                     */
/* ------------------------------------------------------------------ */

function ProgressPanel({ view }: { view: Extract<View, { phase: 'tracking' | 'completed' | 'failed' }> }) {
  const [current, setCurrent] = useState(view);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    if (current.phase !== 'tracking') return;

    let cancelled = false;
    const auditId = current.auditId;

    async function poll() {
      try {
        const res = await fetch(`/api/audit/${auditId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`poll_${res.status}`);
        const body = await res.json();
        if (cancelled) return;

        if (body.status === 'completed') {
          setCurrent({
            phase: 'completed',
            auditId,
            findingsCount: body.findingsCount ?? 0,
            riskScore: body.riskScore ?? null
          });
          return;
        }
        if (body.status === 'failed') {
          setCurrent({ phase: 'failed', message: body.error ?? 'audit_failed' });
          return;
        }
        if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
          setCurrent({ phase: 'failed', message: 'timeout' });
          return;
        }

        setCurrent({
          phase: 'tracking',
          auditId,
          status: body.status,
          findingsCount: body.findingsCount ?? 0,
          riskScore: body.riskScore ?? null
        });
      } catch (err) {
        if (cancelled) return;
        setCurrent({
          phase: 'failed',
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }

    const t = setInterval(poll, POLL_INTERVAL_MS);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [current.phase === 'tracking' ? current.auditId : null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (current.phase === 'failed') {
    return (
      <div className="grid gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex items-center gap-3">
          <XCircle className="h-5 w-5 text-destructive" aria-hidden />
          <div className="font-medium">Audit failed</div>
        </div>
        <p className="text-sm text-muted-foreground">{current.message}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    );
  }

  if (current.phase === 'completed') {
    return (
      <div className="grid gap-4 rounded-lg border border-green-500/30 bg-green-500/5 p-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden />
          <div className="font-medium">Audit complete</div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Risk score</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {current.riskScore ?? '—'}/100
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Findings</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{current.findingsCount}</div>
          </div>
        </div>
        <Button asChild>
          <a href={`../dashboard/${current.auditId}`}>Open the report →</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 rounded-lg border bg-muted/30 p-6">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        <div className="font-medium">
          {current.status === 'pending' && 'Queued — preparing the document.'}
          {current.status === 'running' && 'Auditing — this usually takes under a minute.'}
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full bg-foreground transition-all',
            current.status === 'pending' ? 'w-1/3' : 'w-2/3 animate-pulse'
          )}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Audit id: <code className="font-mono">{current.auditId.slice(0, 8)}</code>
      </p>
    </div>
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
