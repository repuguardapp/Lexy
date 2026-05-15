'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
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
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** AI-suggested replacement segment, ready for user review. */
  rewrite?: string;
  /** Source segment we asked the AI to replace (echoed back so we know what to swap). */
  segment?: string;
  /** Surfaced error code for the rewrite-failed banner. */
  errorCode?: string;
}

/**
 * Premium editor (scaffold).
 *
 * Zero-Knowledge by design: the document was wiped at the end of the
 * original audit, so v1 of the editor asks the user to paste the
 * source text into a textarea. Each finding gets an inline "rewrite"
 * button — the server uses the persisted finding context to suggest a
 * replacement for the offending segment, which the user can apply or
 * discard. Nothing is saved server-side beyond the rewrite API call.
 *
 * Roadmap (not in this scaffold):
 *   - PDF/DOCX re-upload + server-side extraction (re-uses the
 *     existing /api/audit extractor without persisting bytes).
 *   - Highlight evidence spans in the textarea so the offending text
 *     is visually anchored next to its finding.
 *   - Track-changes view (before/after) in PDF export.
 */
export function DocumentEditor({ auditId, targetLanguage, findings, labels, hasRetainedDocument }: Props) {
  const [text, setText] = useState('');
  const [loadingDoc, setLoadingDoc] = useState(hasRetainedDocument);
  const [suggestions, setSuggestions] = useState<Record<string, SuggestionState>>({});

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
    if (!text.trim()) return;
    setSuggestions((prev) => ({ ...prev, [finding.id]: { status: 'loading' } }));
    try {
      const res = await fetch(`/api/audit/${auditId}/rewrite`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          findingId: finding.id,
          documentText: text,
          targetLanguage
        })
      });
      const body = (await res.json().catch(() => ({}))) as {
        rewrite?: string;
        segment?: string;
        error?: string;
      };
      const rewrite = body.rewrite;
      if (!res.ok || !rewrite) {
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
          rewrite,
          ...(body.segment !== undefined ? { segment: body.segment } : {})
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
    if (!s?.rewrite) return;
    // Best-effort segment swap: if the AI echoed back the offending
    // segment, replace its first occurrence in the document. Otherwise
    // append the rewrite at the end and let the user reconcile.
    setText((current) => {
      if (s.segment && current.includes(s.segment)) {
        return current.replace(s.segment, s.rewrite!);
      }
      return `${current}\n\n${s.rewrite}`;
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
          return (
            <Card key={f.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={f.severity === 'critical' ? 'destructive' : 'secondary'}>
                    {f.severity}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">{f.citation}</span>
                </div>
                <CardTitle className="text-sm leading-snug">{f.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <p className="text-muted-foreground">{f.recommendation}</p>
                {!s && (
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
                {s?.status === 'loading' && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    {labels.rewriting}
                  </div>
                )}
                {s?.status === 'ready' && s.rewrite && (
                  <div className="grid gap-2">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {labels.rewriteHint}
                    </p>
                    <blockquote className="border-l-2 border-foreground/30 ps-3 text-pretty text-[13px]">
                      {s.rewrite}
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
