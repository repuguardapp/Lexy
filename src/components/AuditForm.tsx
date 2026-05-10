'use client';

import { useEffect, useState } from 'react';
import { Loader2, XCircle } from 'lucide-react';
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

  // Running card
  processing: {
    queued: string;
    running: string;
    phases: readonly string[]; // rotated client-side every PHASE_INTERVAL_MS
  };

  // Failure card
  failed: {
    title: string;
    tryAgain: string;
    timeout: string;
  };

  // Kept for backwards compatibility with /audit and /embed/audit
  // building the same bundle. No "completed" card is rendered any more
  // — on success we redirect straight to the dashboard so the user
  // sees the report, not an intermediate confirmation screen.
  completed: {
    title: string;
    riskScore: string;
    findingsCount: string;
    openReport: string;
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
  | { phase: 'running' }
  | { phase: 'failed'; message: string };

const PHASE_INTERVAL_MS = 4_500;

/**
 * Audit form — synchronous architecture.
 *
 * The client POSTs the document to /api/audit and awaits a single
 * response that holds for the full duration of the Multi-Pass run
 * (typically 30-90s, capped at Vercel Pro's 300s function ceiling).
 * On success we redirect to the dashboard. On failure we render a
 * card with the server-supplied error code so the user knows what
 * actually happened.
 *
 * Three states:
 *   idle    — form is editable
 *   running — request in flight; rotating phrase animation on a
 *             pure-client timer (no polling, no setInterval against
 *             the server, no race with Vercel)
 *   failed  — error card with structured message
 *
 * Success has no UI state because we navigate away the moment the
 * fetch resolves — see `window.location.assign(body.redirect)` below.
 */
export function AuditForm({ labels, frameworks, defaultLanguage, organizationId }: Props) {
  const [view, setView] = useState<View>({ phase: 'idle' });

  if (view.phase === 'running') return <RunningCard labels={labels} />;
  if (view.phase === 'failed') {
    return <FailedCard message={view.message} labels={labels} />;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setView({ phase: 'running' });

    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch('/api/audit', { method: 'POST', body: form });

      // 402 Payment Required: out of credits — honour the redirect.
      if (res.status === 402) {
        const body = (await res.json().catch(() => ({}))) as { redirect?: string };
        window.location.assign(body.redirect ?? '/pricing');
        return;
      }

      // Fast-path errors (rate limit, validation, etc.) come through
      // with proper HTTP status codes and a non-streamed JSON body.
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        const message = body.detail ? `${body.error ?? 'audit_failed'}: ${body.detail}` : body.error ?? `audit_failed_${res.status}`;
        throw new Error(message);
      }

      // Slow-path: 200 with a streamed envelope. The body has leading
      // whitespace heartbeats — JSON.parse ignores them, so a plain
      // .json() call works. The `ok` field discriminates success from
      // a server-side failure that finished mid-stream.
      const body = (await res.json()) as
        | { ok: true; auditId: string; redirect: string }
        | { ok: false; error: string; detail?: string };

      if (body.ok) {
        // Straight to the report — no intermediate "audit complete" card.
        window.location.assign(body.redirect);
        return;
      }

      // ok === false: extract the structured server error.
      const message = body.detail ? `${body.error}: ${body.detail}` : body.error;
      throw new Error(message);
    } catch (err) {
      setView({ phase: 'failed', message: err instanceof Error ? err.message : String(err) });
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

      <Button type="submit" size="lg" className="w-full sm:w-auto">
        {labels.submit}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Running card — rotates phase strings purely client-side.           */
/* ------------------------------------------------------------------ */

function RunningCard({ labels }: { labels: AuditFormLabels }) {
  const phases = labels.processing.phases;
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  // Rotate phrases every PHASE_INTERVAL_MS for a feeling of progress.
  // The rotation is purely cosmetic — there is no server pulse driving
  // it, the API is held open by the parent component's pending fetch.
  useEffect(() => {
    if (phases.length <= 1) return;
    const t = setInterval(() => {
      setPhaseIndex((i) => (i + 1) % phases.length);
    }, PHASE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [phases.length]);

  // Animate the bar from 0% on mount up to ~92% over the expected
  // audit duration (90s). After that we plateau and let the pulse
  // animation carry the eye until the response lands. We don't reach
  // 100% because that would feel "done" before the redirect fires.
  useEffect(() => {
    // Defer the first setState so the browser sees the 0% value
    // commit, THEN transitions to the target. Without this the
    // CSS `transition` doesn't kick in (start = end).
    const start = setTimeout(() => setProgress(92), 50);
    return () => clearTimeout(start);
  }, []);

  const subPhase = phases[phaseIndex] ?? '';

  return (
    <div className="grid gap-4 rounded-lg border bg-muted/30 p-6">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        <div className="font-medium">{labels.processing.running}</div>
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
            'h-full bg-foreground ease-out',
            progress >= 92 ? 'animate-pulse' : ''
          )}
          style={{
            width: `${progress}%`,
            transition: 'width 90s linear'
          }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Failed card — structured server error + retry CTA.                 */
/* ------------------------------------------------------------------ */

function FailedCard({ message, labels }: { message: string; labels: AuditFormLabels }) {
  return (
    <div className="grid gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <div className="flex items-center gap-3">
        <XCircle className="h-5 w-5 text-destructive" aria-hidden />
        <div className="font-medium">{labels.failed.title}</div>
      </div>
      <p className="text-sm text-muted-foreground break-words font-mono">{message}</p>
      <Button variant="outline" onClick={() => window.location.reload()}>
        {labels.failed.tryAgain}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form field helper                                                  */
/* ------------------------------------------------------------------ */

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

