import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logAccess } from '@/lib/access-log';
import { extractText } from '@/lib/document-extractor';
import { encryptDocument } from '@/lib/document-crypto';
import { runMultiPassAudit } from '@/lib/multi-pass-engine';
import { clientIpFrom, rateLimit } from '@/lib/rate-limit';
import { supabaseService } from '@/lib/supabase';
import { FREE_TIER_MAX_BYTES, getTierForOrg } from '@/lib/tier';
import { hashDocument, wipeBuffer } from '@/lib/zero-knowledge';
import type { FrameworkId } from '@/lib/legal-frameworks';

/**
 * Synchronous audit endpoint — single request, single response.
 *
 * The caller POSTs the document and the audit metadata. We hold the
 * connection open through extraction + Multi-Pass + persistence, then
 * return the full audit envelope (audit id + risk score + findings
 * count). On any failure we return a structured error body the client
 * can render directly to the user.
 *
 * No polling, no background task, no waitUntil. The whole request
 * fits inside Vercel Pro's 300s maxDuration; Anthropic and OpenAI are
 * configured with explicit per-call timeouts (240s / 90s) so we have
 * comfortable headroom.
 *
 * Why we run on the Node.js runtime (not Edge):
 *   • pdf-parse + mammoth ship Node-only code paths (Buffer, fs).
 *   • We need Buffer.fill(0) to wipe document bytes deterministically
 *     on every exit path (Zero-Knowledge guarantee).
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Cost protection. Tighter on IP than on org, and plan-aware: a paying
 * customer (Pro / Enterprise / Business) is on a 20-per-hour IP bucket
 * so a small compliance team behind a corporate NAT isn't artificially
 * throttled. Anonymous and Starter orgs stay at the original 5/h.
 */
const IP_LIMIT_FREE = { windowMs: 60 * 60 * 1000, max: 5  };  // 5/h per IP
const IP_LIMIT_PAID = { windowMs: 60 * 60 * 1000, max: 20 }; // 20/h per IP
const ORG_LIMIT     = { windowMs: 24 * 60 * 60 * 1000, max: 50 };  // 50/day per org

const PAID_PLANS = new Set(['pro', 'enterprise']);
const PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

const Meta = z.object({
  organizationId: z.string().uuid(),
  frameworks: z.string().transform((s) => s.split(',') as FrameworkId[]),
  targetLanguage: z.string().min(2).max(10)
});

/**
 * Strongly-typed error envelope so the client can either show the
 * technical code (failure card) or branch on it (e.g. 402 → pricing
 * redirect). Every code below corresponds to exactly one place in the
 * pipeline that can fail, so a stuck audit is impossible: we either
 * return success or we return one of these.
 */
type AuditError =
  | 'document_required'
  | 'document_too_large'
  | 'document_too_large_free_tier'
  | 'invalid_metadata'
  | 'rate_limited'
  | 'no_credits'
  | 'credit_check_failed'
  | 'extraction_failed'
  | 'anthropic_error'
  | 'openai_error'
  | 'multipass_failed'
  | 'supabase_write_failed';

function errorJson(error: AuditError, detail: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, detail, ...extra }, { status });
}

/**
 * Classify a Multi-Pass exception so the customer sees what actually
 * failed. The Anthropic and OpenAI SDKs both produce typed error
 * subclasses but their constructor names are stable enough that
 * matching on the message + class name keeps the dependency graph
 * minimal.
 */
function classifyAiError(err: unknown): { code: AuditError; detail: string } {
  const detail = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.constructor.name : '';
  const lower = detail.toLowerCase();

  if (name.startsWith('Anthropic') || lower.includes('anthropic') || lower.includes('claude')) {
    return { code: 'anthropic_error', detail };
  }
  if (name.startsWith('OpenAI') || lower.includes('openai') || lower.includes('gpt')) {
    return { code: 'openai_error', detail };
  }
  return { code: 'multipass_failed', detail };
}

export async function POST(request: Request) {
  const t0 = Date.now();
  const log = (step: string, extra: Record<string, unknown> = {}) =>
    console.log('[audit]', JSON.stringify({ step, t: Date.now() - t0, ...extra }));

  // ---- 1. Parse + validate input ------------------------------------
  const form = await request.formData();
  const file = form.get('document');
  if (!(file instanceof Blob)) {
    return errorJson('document_required', 'No file in `document` form field.', 400);
  }
  if (file.size > 25 * 1024 * 1024) {
    return errorJson('document_too_large', `File is ${file.size} bytes, max 25 MB.`, 413);
  }

  let meta: z.infer<typeof Meta>;
  try {
    meta = Meta.parse({
      organizationId: form.get('organizationId'),
      frameworks: form.get('frameworks'),
      targetLanguage: form.get('targetLanguage')
    });
  } catch (err) {
    return errorJson('invalid_metadata', err instanceof Error ? err.message : String(err), 400);
  }
  log('input_parsed', { fileSize: file.size, frameworks: meta.frameworks, lang: meta.targetLanguage });

  // ---- 2. Rate limit ------------------------------------------------
  // Plan-aware IP bucket: lookup the org's active subscription once,
  // bump the ceiling for paying customers. Read uses the service
  // client so it bypasses RLS — we own the row.
  const ip = clientIpFrom(request.headers);
  const { data: subRow } = await supabaseService()
    .from('subscriptions')
    .select('plan,status')
    .eq('organization_id', meta.organizationId)
    .maybeSingle();
  const isPaid = !!subRow
    && PAID_PLANS.has((subRow as { plan?: string }).plan ?? '')
    && PAID_STATUSES.has((subRow as { status?: string }).status ?? '');
  const ipLimitConfig = isPaid ? IP_LIMIT_PAID : IP_LIMIT_FREE;
  const ipLimit  = rateLimit({ key: `audit:ip:${ip}`,                ...ipLimitConfig });
  const orgLimit = rateLimit({ key: `audit:org:${meta.organizationId}`, ...ORG_LIMIT });
  if (!ipLimit.ok || !orgLimit.ok) {
    const offender = !ipLimit.ok ? ipLimit : orgLimit;
    return NextResponse.json(
      { error: 'rate_limited', detail: 'Too many requests', resetAt: offender.resetAt },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((offender.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Reset': String(Math.floor(offender.resetAt / 1000))
        }
      }
    );
  }

  const db = supabaseService();
  const isAnonymousOrg = meta.organizationId === '00000000-0000-0000-0000-000000000000';

  // ---- 3. Credit gate + free-trial fallback (atomic) ----------------
  // Order of precedence:
  //   1. Anonymous-org and paid customers go straight through the
  //      credit-consume RPC (anonymous bypasses inside the function).
  //   2. If the consume returns false (no credits) AND the caller is a
  //      real org currently on the FREE tier AND they have not yet
  //      used their one freebie, we authorise the audit as a free
  //      trial. The free trial is gated on file size (2 MB cap) to
  //      keep AI costs predictable.
  //   3. Any other case → 402, redirect to /pricing.
  const { data: consumed, error: creditErr } = await db.rpc('try_consume_audit_credit', {
    p_org_id: meta.organizationId
  });
  if (creditErr) {
    log('credit_check_failed', { error: creditErr.message });
    return errorJson('credit_check_failed', creditErr.message, 500);
  }

  let usingFreeTrial = false;
  if (!consumed) {
    if (isAnonymousOrg) {
      // Should not happen — the SQL function returns true for anon.
      // Guard rail in case the function definition changes.
      log('no_credits_anon_unexpected');
      return NextResponse.json(
        { error: 'no_credits', detail: 'Anonymous quota exceeded.', redirect: '/pricing' },
        { status: 402 }
      );
    }
    const tier = await getTierForOrg(db, meta.organizationId);
    const { data: orgRow } = await db
      .from('organizations')
      .select('free_audit_used')
      .eq('id', meta.organizationId)
      .maybeSingle();
    const freeAuditUsed =
      (orgRow as { free_audit_used?: boolean } | null)?.free_audit_used ?? false;

    if (tier === 'free' && !freeAuditUsed) {
      if (file.size > FREE_TIER_MAX_BYTES) {
        log('free_tier_size_rejected', { size: file.size, cap: FREE_TIER_MAX_BYTES });
        return errorJson(
          'document_too_large_free_tier',
          `Free tier max ${FREE_TIER_MAX_BYTES} bytes.`,
          413
        );
      }
      usingFreeTrial = true;
      log('free_trial_authorized');
    } else {
      log('no_credits', { tier, freeAuditUsed });
      return NextResponse.json(
        { error: 'no_credits', detail: 'Out of audit credits.', redirect: '/pricing' },
        { status: 402 }
      );
    }
  } else {
    log('credit_consumed');
  }

  // Helper: any failure path beyond this point must refund the credit.
  // Centralising this guarantees we never leak a paid credit when the
  // audit didn't actually deliver. Free-trial paths skip refunds —
  // there is nothing to refund (no credit was consumed) and we have
  // not yet flipped free_audit_used (that happens on success).
  const refundIfNeeded = async (reason: string) => {
    if (usingFreeTrial) {
      log('refund_skipped_free_trial', { reason });
      return;
    }
    const { error: refundErr } = await db.rpc('refund_audit_credit', {
      p_org_id: meta.organizationId
    });
    if (refundErr) {
      log('refund_failed', { reason, error: refundErr.message });
    } else {
      log('credit_refunded', { reason });
    }
  };

  // ---- 4. Slow path — wrapped in a streaming response --------------
  // iOS Safari (and a few mobile carriers' transparent proxies) abort
  // HTTP fetches that don't transmit any bytes for ~60s. The audit
  // pipeline can take 90-120s on a non-trivial document, so a naive
  // `await runMultiPass(); return NextResponse.json(...)` reaches the
  // browser as a "Load failed" TypeError before our reply lands.
  //
  // Fix: stream a ReadableStream that emits a whitespace heartbeat
  // every 10s. The bytes keep the connection technically active; the
  // final chunk is the real JSON envelope. JSON.parse() ignores
  // leading whitespace, so the body parses cleanly on the client.
  //
  // Status code is always 200 for the streamed path — the success vs
  // failure discrimination happens via the `ok` field in the final
  // chunk. The fast-path checks above (rate limit, credits, etc.)
  // still return proper 4xx codes immediately.
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file instanceof File ? file.name : undefined;
  const mime = file.type || undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();

      /**
       * Stream wire format: newline-delimited JSON (NDJSON).
       *   {"type":"progress","progress":10,"stage":"upload"}\n
       *   {"type":"progress","progress":30,"stage":"extraction"}\n
       *   {"type":"progress","progress":60,"stage":"analysis"}\n
       *   {"type":"progress","progress":90,"stage":"writing"}\n
       *   {"type":"final","ok":true,...}\n
       *
       * The client parses one JSON object per line. Progress events
       * drive the UI bar; the final event is exactly one envelope and
       * either redirects (ok:true) or shows the failure card (ok:false).
       */
      const send = (payload: Record<string, unknown>) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(payload) + '\n'));
        } catch {
          // controller is closed — nothing to do.
        }
      };

      const progress = (pct: number, stage: string) => {
        send({ type: 'progress', progress: pct, stage });
      };

      // Heartbeat keeps iOS Safari from aborting on idle if a stage
      // genuinely takes >60s (Multi-Pass on a large doc). Plain space
      // fits between NDJSON lines without confusing the parser
      // (line-by-line readers skip empty lines).
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(enc.encode(' \n'));
        } catch {
          /* controller closed */
        }
      }, 10_000);

      const finish = (payload: Record<string, unknown>) => {
        clearInterval(heartbeat);
        send({ type: 'final', ...payload });
        controller.close();
      };

      // Stage 1: upload received (we're already past the Buffer copy).
      progress(10, 'upload');

      // Stage 2: extraction
      progress(20, 'extraction_start');
      let extracted;
      try {
        extracted = await extractText(buffer, { filename, mime });
        log('extracted', { type: extracted.type, charCount: extracted.charCount, redactionCount: extracted.redactionCount });
        progress(35, 'extraction_done');
      } catch (err) {
        wipeBuffer(buffer);
        await refundIfNeeded('extraction_failed');
        finish({ ok: false, error: 'extraction_failed', detail: err instanceof Error ? err.message : String(err) });
        return;
      }

      // Stage 3: AI analysis (the longest phase — Multi-Pass)
      progress(45, 'analysis_start');
      let report;
      try {
        log('multipass_start');
        report = await runMultiPassAudit({
          documentText: extracted.text,
          frameworks: meta.frameworks,
          targetLanguage: meta.targetLanguage
        });
        report.documentHash = hashDocument(extracted.text);
        log('multipass_done', { findings: report.findings.length, riskScore: report.riskScore });
        progress(85, 'analysis_done');
      } catch (err) {
        wipeBuffer(buffer);
        const { code, detail } = classifyAiError(err);
        log('multipass_failed', { code, detail });
        await refundIfNeeded(code);
        finish({ ok: false, error: code, detail });
        return;
      }

      // Stage 4: writing — persistence to Postgres
      progress(90, 'writing_start');

      // Envelope-encrypt the extracted text iff the org has opted into
      // retention (default true since migration 0009; the anonymous-org
      // placeholder is forced to false there). On any crypto failure
      // we proceed without retention — Zero-Knowledge fallback is
      // strictly safer than a half-encrypted row.
      const { data: orgRow } = await db
        .from('organizations')
        .select('retain_documents')
        .eq('id', meta.organizationId)
        .maybeSingle();
      const retain = (orgRow as { retain_documents?: boolean } | null)?.retain_documents ?? false;

      // Buffers are encoded as Postgres bytea hex literals (\\x…). The
      // supabase-js JSON serializer doesn't natively know about Buffer,
      // so doing the encoding ourselves is both explicit and portable.
      const toBytea = (b: Buffer) => `\\x${b.toString('hex')}`;
      let cryptoFields: {
        document_ciphertext: string;
        document_iv: string;
        document_auth_tag: string;
        document_encrypted_at: string;
      } | null = null;
      if (retain) {
        try {
          const enc = encryptDocument(extracted.text);
          cryptoFields = {
            document_ciphertext: toBytea(enc.ciphertext),
            document_iv: toBytea(enc.iv),
            document_auth_tag: toBytea(enc.authTag),
            document_encrypted_at: new Date().toISOString()
          };
          log('document_encrypted', { bytes: enc.ciphertext.length });
        } catch (err) {
          log('encryption_skipped', { reason: err instanceof Error ? err.message : String(err) });
        }
      }

      // Wipe as early as we can — Multi-Pass and (optionally) the
      // encryption step have consumed the text. The extracted.text
      // string itself is not in `buffer`; it'll be GC'd when this
      // closure returns.
      wipeBuffer(buffer);

      // Persist audit row
      const { data: audit, error: insertErr } = await db
        .from('audits')
        .insert({
          organization_id: meta.organizationId,
          document_hash: report.documentHash,
          frameworks: report.frameworks,
          status: 'completed',
          risk_score: report.riskScore,
          summary: report.summary,
          language: report.language,
          completed_at: report.generatedAt,
          ...(cryptoFields ?? {})
        })
        .select('id')
        .single();

      if (insertErr || !audit) {
        // PG 23505 = unique violation. Our audits_dedup_idx enforces
        // (organization_id, document_hash, language) uniqueness, so
        // hitting this means the exact same audit (same org, same
        // bytes, same target language) already exists. Idempotent
        // retry: surface the existing row instead of failing, and
        // refund the credit because we re-ran the AI for nothing.
        if (insertErr?.code === '23505') {
          const { data: existing, error: lookupErr } = await db
            .from('audits')
            .select('id, risk_score')
            .eq('organization_id', meta.organizationId)
            .eq('document_hash', report.documentHash)
            .eq('language', report.language)
            .maybeSingle();

          if (existing && !lookupErr) {
            log('idempotent_replay', { auditId: existing.id });
            await refundIfNeeded('idempotent_replay');
            const { count: existingFindingsCount } = await db
              .from('audit_findings')
              .select('*', { count: 'exact', head: true })
              .eq('audit_id', existing.id);
            progress(100, 'done');
            finish({
              ok: true,
              auditId: existing.id,
              riskScore: existing.risk_score,
              findingsCount: existingFindingsCount ?? 0,
              redirect: `/dashboard/${existing.id}`,
              replay: true
            });
            return;
          }
        }

        log('supabase_write_failed', {
          code: insertErr?.code,
          message: insertErr?.message,
          hint: insertErr?.hint
        });
        await refundIfNeeded('supabase_write_failed');
        finish({
          ok: false,
          error: 'supabase_write_failed',
          detail: insertErr?.message ?? 'audit row insert returned no id'
        });
        return;
      }
      log('audit_persisted', { auditId: audit.id });

      // Free-trial bookkeeping: flip the org flag now that the audit
      // row exists. Failure to flip is logged but not fatal — worst
      // case the user gets a second freebie on the next attempt, and
      // we'd rather over-serve than fail-close on a paid step.
      if (usingFreeTrial) {
        const { error: flagErr } = await db
          .from('organizations')
          .update({ free_audit_used: true })
          .eq('id', meta.organizationId);
        if (flagErr) {
          log('free_audit_flag_failed', { error: flagErr.message });
        } else {
          log('free_audit_consumed');
        }
      }

      await logAccess({
        organizationId: meta.organizationId,
        action: 'audit_created',
        auditId: audit.id,
        ip,
        userAgent: request.headers.get('user-agent')
      });

      // Persist findings (best-effort — audit row already saved)
      if (report.findings.length > 0) {
        const { error: findingsErr } = await db.from('audit_findings').insert(
          report.findings.map((f) => ({
            audit_id: audit.id,
            framework_id: f.framework,
            citation: f.citation,
            severity: f.severity,
            title: f.title,
            body: f.body,
            recommendation: f.recommendation,
            evidence: f.evidence
          }))
        );
        if (findingsErr) {
          log('findings_insert_failed', { error: findingsErr.message, auditId: audit.id });
        } else {
          log('findings_persisted', { count: report.findings.length });
        }
      }

      log('done', { auditId: audit.id });
      progress(100, 'done');
      finish({
        ok: true,
        auditId: audit.id,
        riskScore: report.riskScore,
        findingsCount: report.findings.length,
        redirect: `/dashboard/${audit.id}`
      });
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Disable any in-path buffering: we need the heartbeat bytes to
      // hit the wire immediately, not get pooled into a 64 KB chunk
      // by an upstream proxy.
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no'
    }
  });
}
