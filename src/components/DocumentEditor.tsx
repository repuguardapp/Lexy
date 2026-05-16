'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Severity } from '@/types/audit';

export interface EditorFinding {
  id: string;
  severity: Severity;
  title: string;
  body: string;
  recommendation: string;
  evidence: string;
  citation: string;
}

export interface DocumentEditorLabels {
  pasteLabel: string;
  pastePlaceholder: string;
  findingsTitle: string;
  rewriteCta: string;
  rewriting: string;
  applyCta: string;
  discardCta: string;
  downloadCta: string;
  emptyDocument: string;
  rewriteError: string;
  rewriteHint: string;
  loadingDocument: string;
  retainedNotice: string;
  resolvedLabel: string;
  noEvidenceAnchor: string;
}

interface Props {
  auditId: string;
  targetLanguage: string;
  findings: EditorFinding[];
  labels: DocumentEditorLabels;
  /** True when the server told us a retained ciphertext exists; the
   *  editor will try to GET /api/audit/[id]/document on mount. */
  hasRetainedDocument: boolean;
}

interface SuggestionState {
  /** Per-finding async lifecycle. */
  status: 'loading' | 'ready' | 'error';
  /** Server-canonical original clause (= finding.evidence). */
  segmentOriginal?: string;
  /** AI-suggested replacement clause. */
  segmentCorrige?: string;
  /** Surfaced error code for the rewrite-failed banner. */
  errorCode?: string;
}

/**
 * Premium clause-rewrite editor.
 *
 * Flow:
 *   1. Mount → if the audit retains a ciphertext, fetch + decrypt
 *      via /api/audit/[id]/document and pre-fill the textarea.
 *   2. User clicks "Corriger cette clause" on a finding → POST
 *      /api/audit/[id]/rewrite with ONLY { findingId, targetLanguage }
 *      (no document text on the wire). Server reads the canonical
 *      clause + rule from Postgres, asks Claude for strict JSON
 *      {segment_original, segment_corrige}.
 *   3. User clicks "Appliquer" → in-place find-and-replace in the
 *      textarea (segment_original is byte-for-byte finding.evidence
 *      so the swap is deterministic). Finding flips to "Résolue ✓"
 *      and the rewrite button disappears — prevents double-apply.
 *   4. User clicks "Télécharger" → exports the edited text as .txt.
 *
 * Nothing is persisted server-side beyond the strict-JSON rewrite
 * round-trip. The decrypted document only exists in the user's
 * browser for the duration of the session.
 */
export function DocumentEditor({
  auditId,
  targetLanguage,
  findings,
  labels,
  hasRetainedDocument
}: Props) {
  const [text, setText] = useState('');
  const [loadingDoc, setLoadingDoc] = useState(hasRetainedDocument);
  const [suggestions, setSuggestions] = useState<Record<string, SuggestionState>>({});
  /** Findings whose suggested rewrite has been applied to the textarea.
   *  Used to flip the card into a "Resolved" state and prevent re-runs. */
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  const wordCount = useMemo(() => text.trim().split(/\s+/).filter(Boolean).length, [text]);

  // Pre-fill the textarea from the encrypted-at-rest document when the
  // server told us one exists. Failures degrade gracefully into
  // paste-mode (the user can still type/paste the source manually).
  useEffect(() => {
    if (!hasRetainedDocument) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/audit/${auditId}/document`, { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setLoadingDoc(false);
          return;
        }
        const body = (await res.json()) as { text?: string };
        if (!cancelled && typeof body.text === 'string') {
          setText(body.text);
        }
      } catch {
        // Network or parse failure: fall back to paste-mode.
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auditId, hasRetainedDocument]);

  async function requestRewrite(finding: EditorFinding) {
    setSuggestions((prev) => ({ ...prev, [finding.id]: { status: 'loading' } }));
    try {
      const res = await fetch(`/api/audit/${auditId}/rewrite`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          findingId: finding.id,
          targetLanguage
        })
      });
      const body = (await res.json().catch(() => ({}))) as {
        segment_original?: string;
        segment_corrige?: string;
        error?: string;
      };
      const segmentCorrige = body.segment_corrige;
      if (!res.ok || !segmentCorrige) {
        setSuggestions((prev) => ({
          ...prev,
          [finding.id]: { status: 'error', errorCode: body.error ?? 'rewrite_failed' }
        }));
        return;
      }
      setSuggestions((prev) => ({
        ...prev,
        [finding.id]: {
          status: 'ready',
          segmentOriginal: body.segment_original ?? finding.evidence,
          segmentCorrige
        }
      }));
    } catch {
      setSuggestions((prev) => ({
        ...prev,
        [finding.id]: { status: 'error', errorCode: 'network_error' }
      }));
    }
  }

  function applySuggestion(findingId: string) {
    const s = suggestions[findingId];
    if (!s?.segmentCorrige) return;
    const needle = s.segmentOriginal;
    // Deterministic swap: the server guarantees segmentOriginal is the
    // verbatim finding.evidence. If it's present in the textarea, swap
    // its first occurrence. If it isn't (the user edited that part
    // manually since the audit ran), surface an inline error rather
    // than appending — appending is what produced duplicate paragraphs
    // in v1 of the editor.
    if (!needle || !text.includes(needle)) {
      setSuggestions((prev) => ({
        ...prev,
        [findingId]: { status: 'error', errorCode: 'segment_not_found' }
      }));
      return;
    }
    setText((current) => current.replace(needle, s.segmentCorrige!));
    setResolved((prev) => {
      const next = new Set(prev);
      next.add(findingId);
      return next;
    });
    setSuggestions((prev) => {
      const next = { ...prev };
      delete next[findingId];
      return next;
    });
  }

  function discardSuggestion(findingId: string) {
    setSuggestions((prev) => {
      const next = { ...prev };
      delete next[findingId];
      return next;
    });
  }

  function downloadAsText() {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lexyflow-${auditId.slice(0, 8)}-edited.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="grid gap-3">
        {hasRetainedDocument && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
            {labels.retainedNotice}
          </p>
        )}
        <label className="grid gap-2">
          <span className="text-sm font-medium">{labels.pasteLabel}</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={loadingDoc ? labels.loadingDocument : labels.pastePlaceholder}
            disabled={loadingDoc}
            className="min-h-[60vh] resize-y rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            aria-label={labels.pasteLabel}
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {loadingDoc
              ? labels.loadingDocument
              : wordCount > 0
                ? `${wordCount} words`
                : labels.emptyDocument}
          </span>
          <Button onClick={downloadAsText} variant="outline" size="sm" disabled={!text.trim()}>
            {labels.downloadCta}
          </Button>
        </div>
      </section>

      <aside className="grid gap-3 self-start lg:sticky lg:top-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {labels.findingsTitle} ({findings.length})
        </h2>
        {findings.map((f) => {
          const s = suggestions[f.id];
          const isResolved = resolved.has(f.id);
          const hasEvidence = f.evidence.trim().length > 0;
          return (
            <Card key={f.id} className={isResolved ? 'border-emerald-300/60 bg-emerald-50/40 dark:bg-emerald-950/10' : undefined}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={f.severity === 'critical' ? 'destructive' : 'secondary'}>
                    {f.severity}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">{f.citation}</span>
                  {isResolved && (
                    <span className="ms-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      {labels.resolvedLabel}
                    </span>
                  )}
                </div>
                <CardTitle className="text-sm leading-snug">{f.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <p className="text-muted-foreground">{f.recommendation}</p>
                {!s && !isResolved && hasEvidence && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => requestRewrite(f)}
                    disabled={!text.trim()}
                  >
                    <Sparkles className="me-2 h-3.5 w-3.5" aria-hidden />
                    {labels.rewriteCta}
                  </Button>
                )}
                {!s && !isResolved && !hasEvidence && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                    {labels.noEvidenceAnchor}
                  </p>
                )}
                {s?.status === 'loading' && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    {labels.rewriting}
                  </div>
                )}
                {s?.status === 'ready' && s.segmentCorrige && (
                  <div className="grid gap-2">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {labels.rewriteHint}
                    </p>
                    <blockquote className="border-l-2 border-foreground/30 ps-3 text-pretty text-[13px]">
                      {s.segmentCorrige}
                    </blockquote>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => applySuggestion(f.id)}>
                        {labels.applyCta}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1"
                        onClick={() => discardSuggestion(f.id)}
                      >
                        {labels.discardCta}
                      </Button>
                    </div>
                  </div>
                )}
                {s?.status === 'error' && (
                  <p className="text-destructive">{labels.rewriteError}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </aside>
    </div>
  );
}
