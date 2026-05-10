'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FrameworkOption {
  id: string;
  name: string;
}

/**
 * All UX strings for the audit lifecycle. Pulled from `messages/*.json`
 * via the audit/page server component and passed in as a single object
 * — no string is hardcoded in this client component, so the same
 * bundle ships to every locale without divergence.
 */
export interface AuditFormLabels {
  // Form
  upload: string;
  uploadHint: string;
  targetLanguage: string;
  targetLanguageHint: string;
  framework: string;
  submit: string;
  running: string;

  // Processing card
  processing: {
    queued: string;
    running: string;
    auditId: string;          // ICU template with {id}
    phases: readonly string[]; // rotated every PHASE_INTERVAL_MS
  };

  // Success card
  completed: {
    title: string;
    riskScore: string;
    findingsCount: string;
    openReport: string;
  };

  // Failure card
  failed: {
    title: string;
    tryAgain: string;
    timeout: string;
  };
}

interface Props {
  labels: AuditFormLabels;
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
// 10 min covers cold start + extraction + Multi-Pass + persistence even
// for the largest documents we accept. We also re-poll on
// `visibilitychange` because iOS Safari throttles background tabs to
// roughly one timer fire per minute, which used to make a finished
// audit look like a timeout when the user switched apps mid-run.
const POLL_TIMEOUT_MS  = 10 * 60 * 1_000;
const PHASE_INTERVAL_MS = 4_500;

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
    return <ProgressPanel view={view} labels={labels} />;
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

function ProgressPanel({
  view,
  labels
}: {
  view: Extract<View, { phase: 'tracking' | 'completed' | 'failed' }>;
  labels: AuditFormLabels;
}) {
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
          setCurrent({ phase: 'failed', message: labels.failed.timeout });
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

    // iOS Safari (and most mobile browsers) throttle setInterval down to
    // one fire per minute on background tabs. Without this listener, an
    // audit that finished while the tab was hidden would not be
    // discovered until the user manually refreshed.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [current.phase === 'tracking' ? current.auditId : null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (current.phase === 'failed') {
    return (
      <div className="grid gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex items-center gap-3">
          <XCircle className="h-5 w-5 text-destructive" aria-hidden />
          <div className="font-medium">{labels.failed.title}</div>
        </div>
        <p className="text-sm text-muted-foreground break-words">{current.message}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {labels.failed.tryAgain}
        </Button>
      </div>
    );
  }

  if (current.phase === 'completed') {
    return (
      <div className="grid gap-4 rounded-lg border border-green-500/30 bg-green-500/5 p-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden />
          <div className="font-medium">{labels.completed.title}</div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {labels.completed.riskScore}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {current.riskScore ?? '—'}/100
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {labels.completed.findingsCount}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{current.findingsCount}</div>
          </div>
        </div>
        <Button asChild>
          <a href={`../dashboard/${current.auditId}`}>{labels.completed.openReport}</a>
        </Button>
      </div>
    );
  }

  return <RunningCard auditId={current.auditId} status={current.status} labels={labels} />;
}

/* ------------------------------------------------------------------ */
/* Running card with animated phase rotation                          */
/* ------------------------------------------------------------------ */

function RunningCard({
  auditId,
  status,
  labels
}: {
  auditId: string;
  status: AuditStatus;
  labels: AuditFormLabels;
}) {
  const phases = labels.processing.phases;
  const [phaseIndex, setPhaseIndex] = useState(0);

  // Rotate phrases every PHASE_INTERVAL_MS for a feeling of progress.
  // The rotation is purely cosmetic — it does not reflect actual
  // backend stages because the server-side pipeline is opaque to the
  // client (we only see status='pending' or 'running' on poll).
  useEffect(() => {
    if (phases.length <= 1) return;
    const t = setInterval(() => {
      setPhaseIndex((i) => (i + 1) % phases.length);
    }, PHASE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [phases.length]);

  const headline =
    status === 'pending' ? labels.processing.queued : labels.processing.running;
  const subPhase = phases[phaseIndex] ?? '';
  const auditLabel = labels.processing.auditId.replace('{id}', auditId.slice(0, 8));

  return (
    <div className="grid gap-4 rounded-lg border bg-muted/30 p-6">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        <div className="font-medium">{headline}</div>
      </div>
      <div
        key={phaseIndex}
        className="text-sm text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500"
        aria-live="polite"
      >
        {subPhase}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full bg-foreground transition-all',
            status === 'pending' ? 'w-1/3' : 'w-2/3 animate-pulse'
          )}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        <code className="font-mono">{auditLabel}</code>
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
