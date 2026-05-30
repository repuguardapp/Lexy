import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_LOCALE_CODES } from '../src/i18n/locales';

/**
 * Pre-launch size-limit + i18n contract.
 *
 * Two ceilings live in the audit pipeline:
 *
 *   25 MB hard cap, universal — anything above it is a 413
 *     `document_too_large` regardless of tier. Documents past this
 *     point would blow our Anthropic context window and Vercel's
 *     function body limit, so this gate must fire BEFORE any DB
 *     work happens.
 *
 *   2 MB free-tier cap — when the credit consume returns "no
 *     credits left" AND the org is on free tier AND has not yet
 *     used its one freebie, a smaller cap kicks in so the freebie
 *     doesn't burn through paid AI budget. The response is a
 *     distinct 413 `document_too_large_free_tier` so the UI can
 *     branch on it ("upgrade to lift the cap" vs "file just too
 *     big period").
 *
 * The tests below verify both ceilings AND the i18n surface that
 * the UI uses to render them. The i18n parity check is the cheap
 * regression catcher for "we shipped a new locale and forgot the
 * two error keys" — a class of bug that historically produced raw
 * snake_case error codes in front of paying GCC customers.
 */

vi.mock('server-only', () => ({}));

// The route lazily reads supabaseService(); we mock it to a no-op
// stub so the 25 MB universal cap test never has to touch a real
// supabase client. The 2 MB cap test below installs richer stubs.
const stubDb = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error: null })
      })
    })
  }),
  rpc: async () => ({ data: null, error: null })
};
vi.mock('@/lib/supabase', () => ({
  supabaseService: () => stubDb
}));

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------- 25 MB universal hard cap ------------------------------------

describe('POST /api/audit — 25 MB universal hard cap', () => {
  it('returns 413 document_too_large before any DB work when file > 25 MB', async () => {
    // 25 MB + 1 byte — Blob backed by an actual buffer so the route's
    // `file instanceof Blob` and `file.size` checks both see the
    // truth. A 25 MB allocation is small enough to keep the test
    // suite snappy.
    const oversized = new Blob([new Uint8Array(25 * 1024 * 1024 + 1)]);
    const form = new FormData();
    form.set('document', oversized, 'huge.txt');
    // Org id and frameworks are still required to reach the size
    // check, but the size check fires before they are validated, so
    // we send the anonymous-org placeholder to keep the test
    // independent of the auth path.
    form.set('organizationId', '00000000-0000-0000-0000-000000000000');
    form.set('frameworks', 'gdpr');
    form.set('targetLanguage', 'en');

    const { POST } = await import('@/app/api/audit/route');
    const res = await POST(
      new Request('https://lexyflow.com/api/audit', { method: 'POST', body: form })
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe('document_too_large');
    // The detail message should mention the 25 MB cap so the front
    // end can render the correct user-facing string even without an
    // i18n lookup on the error code.
    expect(body.detail).toMatch(/25 MB/);
  });
});

// ---------- 2 MB free-tier cap ------------------------------------------

describe('POST /api/audit — 2 MB free-tier cap', () => {
  beforeEach(() => {
    // Auth: session matches the form's org id, so the spoof guard
    // lets the request through into the credit / tier branch.
    vi.doMock('@/lib/supabase-server', () => ({
      getCurrentUser: async () => ({
        id: 'u1',
        app_metadata: { organization_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }
      }),
      organizationIdFromUser: (u: { app_metadata?: { organization_id?: string } } | null) =>
        u?.app_metadata?.organization_id ?? null
    }));

    // Tier resolver: this org is on the free tier and has not yet
    // burned its freebie — the exact precondition for the 2 MB cap
    // to fire.
    vi.doMock('@/lib/tier', () => ({
      FREE_TIER_MAX_BYTES: 2 * 1024 * 1024,
      getTierForOrg: async () => 'free'
    }));

    // Rich supabase stub:
    //  • subscriptions.eq(...).maybeSingle() → no row (free tier).
    //  • organizations.select('free_audit_used').maybeSingle()
    //      → free_audit_used = false (the one freebie is still
    //        available, so we enter the size-cap branch).
    //  • rpc('try_consume_audit_credit') → { data: false, error: null }
    //    (no paid credits, falls through to the free-trial path).
    vi.doMock('@/lib/supabase', () => ({
      supabaseService: () => ({
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (table === 'organizations') {
                  return { data: { free_audit_used: false }, error: null };
                }
                return { data: null, error: null };
              }
            })
          })
        }),
        rpc: async (fn: string) => {
          if (fn === 'try_consume_audit_credit') {
            return { data: false, error: null };
          }
          return { data: null, error: null };
        }
      })
    }));
  });

  it('returns 413 document_too_large_free_tier when file > 2 MB on free tier', async () => {
    // 2 MB + 1 byte: above the free cap, below the 25 MB universal
    // cap, so this exercises the free-tier branch specifically.
    const tooBigForFree = new Blob([new Uint8Array(2 * 1024 * 1024 + 1)]);
    const form = new FormData();
    form.set('document', tooBigForFree, 'doc.txt');
    form.set('organizationId', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    form.set('frameworks', 'gdpr');
    form.set('targetLanguage', 'fr');

    const { POST } = await import('@/app/api/audit/route');
    const res = await POST(
      new Request('https://lexyflow.com/api/audit', { method: 'POST', body: form })
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe('document_too_large_free_tier');
    // The detail explicitly references the byte cap so the UI can
    // show the user how much margin they were over.
    expect(body.detail).toMatch(/2097152/);
  });
});

// ---------- i18n parity for both error codes ----------------------------

describe('i18n surface for size-cap errors', () => {
  const ERROR_KEYS = ['document_too_large', 'document_too_large_free_tier'] as const;
  const MESSAGES_DIR = path.join(__dirname, '..', 'messages');

  // The audit pipeline returns the snake_case code as an `error`
  // field; the UI looks it up under a stable namespace to render the
  // localised message. If a translator forgets to add the key for a
  // newly-supported locale, the UI shows the raw code to the user —
  // exactly what we want to never happen in front of a paying GCC
  // customer.
  for (const locale of NATIVE_LOCALE_CODES) {
    it(`locale "${locale}" exposes both size-error keys with a non-empty string`, () => {
      const file = path.join(MESSAGES_DIR, `${locale}.json`);
      const raw = readFileSync(file, 'utf8');
      const json = JSON.parse(raw) as Record<string, unknown>;
      // The keys live under any of a handful of plausible namespaces.
      // Rather than encode each, we just assert one of the namespaces
      // contains them. The flat search is fine for a 7-locale test
      // and tolerates a future reorganisation of the JSON shape.
      const flat = JSON.stringify(json);
      for (const key of ERROR_KEYS) {
        expect(flat.includes(`"${key}"`), `${locale}: missing key ${key}`).toBe(true);
      }
      // And the value itself must be non-empty (i.e. someone
      // actually translated it — not just stubbed `""` to pass a
      // schema check).
      function* values(obj: unknown): IterableIterator<string> {
        if (obj === null || obj === undefined) return;
        if (typeof obj === 'string') {
          yield obj;
          return;
        }
        if (typeof obj === 'object') {
          for (const k of Object.keys(obj as Record<string, unknown>)) {
            const v = (obj as Record<string, unknown>)[k];
            if (ERROR_KEYS.includes(k as (typeof ERROR_KEYS)[number]) && typeof v === 'string') {
              expect(v.trim().length, `${locale}: empty translation for ${k}`).toBeGreaterThan(0);
            }
            yield* values(v);
          }
        }
      }
      // Consume the generator so the inner expects actually run.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const _ of values(json)) {
        // intentional — the generator's side effect is the assertion.
      }
    });
  }
});
