import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for the org-spoofing security audit.
 *
 * Two routes used to trust a client-supplied `organizationId`:
 *
 *   1. POST /api/checkout — would forward the body's organizationId
 *      straight to Stripe Checkout, letting a logged-in attacker land
 *      a subscription on someone else's org by pasting the victim's
 *      UUID into the request body.
 *
 *   2. POST /api/audit — would consume credits from, write rows to,
 *      and trip the per-org rate limit of any org whose UUID the
 *      attacker happened to know.
 *
 * Both now derive (or verify against) the session org id. These
 * tests pin the contract so a future refactor doesn't accidentally
 * re-introduce the trust boundary.
 */

vi.mock('server-only', () => ({}));

const ORG_USER = '11111111-1111-1111-1111-111111111111';
const ORG_VICTIM = '22222222-2222-2222-2222-222222222222';
const ANON_ORG = '00000000-0000-0000-0000-000000000000';

type FakeUser = { id: string; app_metadata?: { organization_id?: string } };
const mockGetCurrentUser: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<FakeUser | null> => null);
const mockCreateCheckoutSession: ReturnType<typeof vi.fn> = vi.fn(
  async (_opts: unknown) => ({ id: 'cs_test_x', url: 'https://stripe/cs_test_x' })
);

vi.mock('@/lib/supabase-server', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  organizationIdFromUser: (u: { app_metadata?: { organization_id?: string } } | null) =>
    u?.app_metadata?.organization_id ?? null
}));

vi.mock('@/lib/stripe', () => ({
  createCheckoutSession: (opts: unknown) => mockCreateCheckoutSession(opts)
}));

// We stub supabaseService() as a counter that throws. The double
// duty is intentional:
//
//   • Throwing means we never accidentally drive the audit pipeline
//     (rate-limit lookup, credit RPC, AI calls, persistence) from a
//     unit test. If a future refactor introduces a 500 before the
//     spoof guard, the throw blows up loudly in the test we care
//     about instead of silently passing.
//
//   • Counting gives us a hard assertion that the spoof-guard
//     code path NEVER calls into the DB layer. The whole point of
//     the fix is that try_consume_audit_credit must not be reached
//     when the request is rejected for org-mismatch — without this
//     spy, a future refactor that moves the RPC above the guard
//     would still pass the 401/403 assertions because the early
//     return masks the side effect.
const supabaseServiceSpy = vi.fn(() => {
  throw new Error('supabase_mocked');
});
vi.mock('@/lib/supabase', () => ({
  supabaseService: () => supabaseServiceSpy()
}));

beforeEach(() => {
  mockGetCurrentUser.mockReset();
  mockCreateCheckoutSession.mockClear();
  supabaseServiceSpy.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/checkout — org spoof guard', () => {
  async function postCheckout(body: Record<string, unknown>) {
    const { POST } = await import('@/app/api/checkout/route');
    return POST(
      new Request('https://lexyflow.com/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://lexyflow.com' },
        body: JSON.stringify(body)
      })
    );
  }

  it('rejects with 401 when no session', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);
    const res = await postCheckout({ plan: 'starter', locale: 'en', organizationId: ORG_USER });
    expect(res.status).toBe(401);
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the body org id differs from the session org id', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      id: 'u1',
      app_metadata: { organization_id: ORG_USER }
    });
    const res = await postCheckout({ plan: 'pro', locale: 'fr', organizationId: ORG_VICTIM });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('organization_mismatch');
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('accepts when the body org id matches the session', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      id: 'u1',
      app_metadata: { organization_id: ORG_USER }
    });
    const res = await postCheckout({ plan: 'starter', locale: 'en', organizationId: ORG_USER });
    expect(res.status).toBe(200);
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
    // Critical: the value forwarded to Stripe must be the session
    // org id, never the request body field. This guards against a
    // future refactor that re-introduces the trust boundary by
    // mistake.
    const firstCall = mockCreateCheckoutSession.mock.calls[0];
    expect(firstCall).toBeDefined();
    const args = firstCall![0] as { organizationId: string };
    expect(args.organizationId).toBe(ORG_USER);
  });
});

describe('POST /api/audit — org spoof guard', () => {
  async function postAudit(orgId: string, withUser: boolean, sessionOrg?: string) {
    if (withUser) {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'u1',
        app_metadata: sessionOrg ? { organization_id: sessionOrg } : {}
      });
    } else {
      mockGetCurrentUser.mockResolvedValueOnce(null);
    }
    const form = new FormData();
    form.set('document', new Blob(['hello'], { type: 'text/plain' }), 'doc.txt');
    form.set('organizationId', orgId);
    form.set('frameworks', 'gdpr');
    form.set('targetLanguage', 'en');
    const { POST } = await import('@/app/api/audit/route');
    return POST(
      new Request('https://lexyflow.com/api/audit', {
        method: 'POST',
        body: form
      })
    );
  }

  it('rejects with 401 when a non-anon org id is submitted without a session', async () => {
    const res = await postAudit(ORG_USER, false);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthenticated');
    // Hard contract: a spoofed-with-no-session request must not
    // reach the supabase layer. If it did, the credit RPC could
    // run before the 401 was returned and the org being spoofed
    // would silently lose a credit.
    expect(supabaseServiceSpy).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the session org id differs from the form org id', async () => {
    const res = await postAudit(ORG_VICTIM, true, ORG_USER);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('organization_mismatch');
    // Same contract as above — confirmed for the logged-in
    // attacker path. The credit RPC, the rate-limit table read,
    // the audit row insert: none must execute when the guard
    // rejects. supabaseService() being uncalled is the umbrella
    // proof for all three.
    expect(supabaseServiceSpy).not.toHaveBeenCalled();
  });

  it('does NOT require auth for anonymous-org submissions (public share-link flow)', async () => {
    // The anonymous-org UUID is the public-by-UUID placeholder. The
    // spoof guard must short-circuit and let the request proceed
    // into the audit pipeline. We mock supabaseService() to throw so
    // we don't drive the rest of the pipeline; the assertion is that
    // the response is not 401 / 403 (which would mean our guard
    // wrongly bounced an anonymous submission) AND that the supabase
    // layer was actually reached (which confirms the guard cleared).
    try {
      const res = await postAudit(ANON_ORG, false);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    } catch (err) {
      // The mocked supabaseService throws synchronously inside the
      // route, which is the expected sign that the spoof guard
      // allowed the request through.
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe('supabase_mocked');
    }
    expect(supabaseServiceSpy).toHaveBeenCalled();
  });
});
