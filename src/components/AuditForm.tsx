'use client';

import { useState } from 'react';
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

  /** Localized message per server error code (lookup `errors[code]`).
   *  Includes a `generic` fallback for any code not in the map. */
  errors: Readonly<Record<string, string>>;

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
  | { phase: 'running'; progress: number }
  | { phase: 'failed'; message: string };

/**
 * Typed wrapper used purely to mark which throws inside onSubmit
 * already carry a known server error code — anything else is
 * coerced to `generic` in the catch. The String value of `err.code`
 * is the dictionary key for `labels.errors[...]`.
 */
class AuditError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'AuditError';
  }
}

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

  if (view.phase === 'running') return <RunningCard progress={view.progress} labels={labels} />;
  if (view.phase === 'failed') {
    return <FailedCard message={view.message} labels={labels} />;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setView({ phase: 'running', progress: 5 });

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
        // Log technical detail for debugging — UI shows a friendly
        // localized message via labels.errors[code].
        if (body.detail) console.error('[audit] server error detail:', body.error, body.detail);
        throw new AuditError(body.error ?? 'generic');
      }

      // Slow-path: NDJSON stream. One JSON object per line:
      //   {"type":"progress","progress":35,"stage":"extraction_done"}
      //   {"type":"progress","progress":85,"stage":"analysis_done"}
      //   ...
      //   {"type":"final","ok":true,"redirect":"/dashboard/..."}
      // Heartbeat lines are bare whitespace/empty — skipped.
      if (!res.body) throw new Error('audit_no_stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;

          let evt: { type?: string; progress?: number; ok?: boolean; redirect?: string; error?: string; detail?: string };
          try {
            evt = JSON.parse(line);
          } catch {
            // Garbage line — extremely unlikely with our server, but
            // we'd rather skip than crash the whole audit on it.
            continue;
          }

          if (evt.type === 'progress' && typeof evt.progress === 'number') {
            setView({ phase: 'running', progress: evt.progress });
          } else if (evt.type === 'final') {
            if (evt.ok && evt.redirect) {
              window.location.assign(evt.redirect);
              return;
            }
            // Final event with ok:false carries the structured code;
            // log the technical detail and surface only the code so
            // the FailedCard can localize it.
            if (evt.detail) console.error('[audit] server error detail:', evt.error, evt.detail);
            throw new AuditError(evt.error ?? 'generic');
          }
        }
      }

      // Stream ended without a `final` event — the server died mid-flight.
      throw new AuditError('audit_stream_truncated');
    } catch (err) {
      const code = err instanceof AuditError ? err.code : 'generic';
      if (!(err instanceof AuditError)) console.error('[audit] client error:', err);
      setView({ phase: 'failed', message: code });
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

function RunningCard({ progress, labels }: { progress: number; labels: AuditFormLabels }) {
  const phases = labels.processing.phases;

  // Map server-driven progress to the rotating phrase index. Each
  // phase string covers an equal slice of the 0-100 range, so the
  // visible phrase tracks real backend stages instead of a free-
  // running client timer. With 6 phases: 0-16 = phrase 0,
  // 17-33 = phrase 1, ..., 83-100 = phrase 5.
  const idx = phases.length > 0
    ? Math.min(phases.length - 1, Math.floor((progress / 100) * phases.length))
    : 0;
  const subPhase = phases[idx] ?? '';

  // Clamp to [5, 100] for visual stability — a 0% bar at startup
  // looks broken; the server's first event lands at 10% in <1s.
  const visualPct = Math.max(5, Math.min(100, progress));

  return (
    <div className="grid gap-4 rounded-lg border bg-muted/30 p-6">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        <div className="font-medium">{labels.processing.running}</div>
      </div>
      <div
        key={idx}
        className="text-sm text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500"
        aria-live="polite"
      >
        {subPhase}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-foreground"
          style={{
            width: `${visualPct}%`,
            // Smooth catch-up between server events without overshooting
            // — a 600ms ease-out feels responsive without looking jumpy.
            transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(visualPct)}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Failed card — structured server error + retry CTA.                 */
/* ------------------------------------------------------------------ */

function FailedCard({ message, labels }: { message: string; labels: AuditFormLabels }) {
  // `message` is the server error code (e.g. "anthropic_error",
  // "no_credits"). Look it up in the localized errors map so the
  // user reads a human sentence in their language. Fall back to the
  // generic message if the code is unknown.
  const friendly =
    labels.errors[message] ?? labels.errors.generic ?? labels.failed.title;
  return (
    <div className="grid gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <div className="flex items-center gap-3">
        <XCircle className="h-5 w-5 text-destructive" aria-hidden />
        <div className="font-medium">{labels.failed.title}</div>
      </div>
      <p className="text-sm text-muted-foreground break-words">{friendly}</p>
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

