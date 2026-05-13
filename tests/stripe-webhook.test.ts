import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Stripe webhook handler tests. We isolate the route from the network by
 * mocking @/lib/stripe (signature verification + subscriptions.retrieve)
 * and @/lib/supabase (idempotency table + business writes + RPCs), so the
 * test exercises only the handler's branching logic without ever
 * touching a real Stripe account or a real Supabase project.
 */

vi.mock('server-only', () => ({}));

type DbErr = { code: string; message: string } | null;
const mockConstructEvent = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();
const mockUpsert: ReturnType<typeof vi.fn> = vi.fn(async (_payload: unknown, _opts?: unknown) => ({ error: null as DbErr }));
const mockUpdate = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null as DbErr })) }));
const mockInsert: ReturnType<typeof vi.fn> = vi.fn(async (_row: unknown) => ({ error: null as DbErr }));
const mockRpc: ReturnType<typeof vi.fn> = vi.fn(async (_fn: string, _args: unknown) => ({ error: null as DbErr }));

const tableHandlers: Record<string, () => unknown> = {
  organizations: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
  subscriptions: () => ({ upsert: mockUpsert, update: mockUpdate }),
  stripe_webhook_events: () => ({ insert: mockInsert })
};

vi.mock('@/lib/stripe', async () => {
  // We keep PLAN_CREDITS real — it's a pure constant. The function
  // surface (`stripe()`) is fully mocked so no network call ever fires.
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe');
  return {
    ...actual,
    stripe: () => ({
      webhooks: { constructEvent: mockConstructEvent },
      subscriptions: { retrieve: mockSubscriptionsRetrieve }
    })
  };
});

vi.mock('@/lib/supabase', () => ({
  supabaseService: () => ({
    from: (name: string) => tableHandlers[name]?.() ?? {},
    rpc: mockRpc
  })
}));

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.STRIPE_PRICE_STARTER = 'price_starter';
  process.env.STRIPE_PRICE_PRO = 'price_pro';
  process.env.STRIPE_PRICE_ENTERPRISE = 'price_enterprise';

  mockConstructEvent.mockReset();
  mockSubscriptionsRetrieve.mockReset();
  mockUpsert.mockClear();
  mockUpdate.mockClear();
  mockInsert.mockReset();
  mockInsert.mockReturnValue(Promise.resolve({ error: null }));
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ error: null });
});

afterEach(() => vi.clearAllMocks());

async function callHandler(headers: Record<string, string>, body: string) {
  // Importing inside the test ensures the env vars set above are read.
  const mod = await import('../src/app/api/stripe-webhook/route');
  return mod.POST(new Request('https://lexyflow.com/api/stripe-webhook', {
    method: 'POST',
    headers,
    body
  }));
}

/** Convenience builder for a Stripe.Subscription shape that retrieve() returns. */
function fakeSubscription(opts: { priceId: string; orgId?: string | null }) {
  return {
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    metadata: opts.orgId === null ? {} : { organization_id: opts.orgId ?? '00000000-0000-0000-0000-000000000001' },
    items: { data: [{ price: { id: opts.priceId } }] },
    current_period_start: 1_700_000_000,
    current_period_end:   1_702_000_000,
    cancel_at: null,
    canceled_at: null
  };
}

/** Convenience builder for an invoice.paid event. */
function invoicePaidEvent(opts: { subscriptionId: string | null; eventId?: string }) {
  return {
    id: opts.eventId ?? `evt_inv_${Math.random().toString(36).slice(2, 10)}`,
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_abc',
        subscription: opts.subscriptionId
      }
    }
  };
}

describe('Stripe webhook · signature verification', () => {
  it('rejects when stripe-signature header is missing', async () => {
    const res = await callHandler({}, '{}');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('missing_signature');
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  it('rejects when STRIPE_WEBHOOK_SECRET is unset', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await callHandler({ 'stripe-signature': 't=1,v1=x' }, '{}');
    expect(res.status).toBe(500);
  });

  it('rejects when constructEvent throws', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });
    const res = await callHandler({ 'stripe-signature': 't=1,v1=bad' }, '{}');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_signature');
  });
});

describe('Stripe webhook · idempotency', () => {
  it('returns 200 + idempotent flag on duplicate event id (PG 23505)', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_dup',
      type: 'invoice.paid',
      data: { object: {} }
    });
    mockInsert.mockReturnValueOnce(Promise.resolve({ error: { code: '23505', message: 'duplicate' } }));

    const res = await callHandler({ 'stripe-signature': 't=1,v1=ok' }, '{}');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.idempotent).toBe(true);
    // The RPC must not run when the dedup layer rejected the event.
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns 500 when the audit-trail insert fails for non-conflict reasons', async () => {
    mockConstructEvent.mockReturnValue({ id: 'evt_x', type: 'invoice.paid', data: { object: {} } });
    mockInsert.mockReturnValueOnce(Promise.resolve({ error: { code: '08006', message: 'connection lost' } }));

    const res = await callHandler({ 'stripe-signature': 't=1,v1=ok' }, '{}');
    expect(res.status).toBe(500);
  });
});

describe('Stripe webhook · subscription lifecycle dispatch', () => {
  it('routes customer.subscription.updated to subscriptions.upsert', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_sub_1',
      type: 'customer.subscription.updated',
      data: { object: fakeSubscription({ priceId: 'price_pro' }) }
    });

    const res = await callHandler({ 'stripe-signature': 't=1,v1=ok' }, '{}');
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const firstCall = mockUpsert.mock.calls[0];
    if (!firstCall) throw new Error('upsert was not called');
    const upsertArg = firstCall[0] as Record<string, unknown>;
    expect(upsertArg.plan).toBe('pro');
    expect(upsertArg.status).toBe('active');
    expect(upsertArg.stripe_subscription_id).toBe('sub_123');
  });

  it('skips upsert when the price id is unknown', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_sub_2',
      type: 'customer.subscription.updated',
      data: { object: fakeSubscription({ priceId: 'price_unknown' }) }
    });

    const res = await callHandler({ 'stripe-signature': 't=1,v1=ok' }, '{}');
    expect(res.status).toBe(200);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('marks the row canceled on customer.subscription.deleted', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_sub_3',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_789' } }
    });

    const res = await callHandler({ 'stripe-signature': 't=1,v1=ok' }, '{}');
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/* The commercialization-critical path: invoice.paid → credits top-up */
/* ------------------------------------------------------------------ */

describe('Stripe webhook · invoice.paid credit top-up', () => {
  it('credits the org with 10 audits on the Starter plan', async () => {
    mockConstructEvent.mockReturnValue(invoicePaidEvent({ subscriptionId: 'sub_starter' }));
    mockSubscriptionsRetrieve.mockResolvedValue(fakeSubscription({ priceId: 'price_starter' }));

    const res = await callHandler({ 'stripe-signature': 't=1,v1=ok' }, '{}');
    expect(res.status).toBe(200);

    // Exactly one rpc call, exactly the right shape and amount.
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('add_audit_credits', {
      p_org_id: '00000000-0000-0000-0000-000000000001',
      p_amount: 10
    });
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_starter');
  });

  it('credits the org with 100 audits on the Pro plan', async () => {
    mockConstructEvent.mockReturnValue(invoicePaidEvent({ subscriptionId: 'sub_pro' }));
    mockSubscriptionsRetrieve.mockResolvedValue(fakeSubscription({ priceId: 'price_pro' }));

    const res = await callHandler({ 'stripe-signature': 't=1,v1=ok' }, '{}');
    expect(res.status).toBe(200);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('add_audit_credits', {
      p_org_id: '00000000-0000-0000-0000-000000000001',
      p_amount: 100
    });
  });

  it('credits the org with 1000 audits on the Enterprise plan', async () => {
    mockConstructEvent.mockReturnValue(invoicePaidEvent({ subscriptionId: 'sub_ent' }));
    mockSubscriptionsRetrieve.mockResolvedValue(fakeSubscription({ priceId: 'price_enterprise' }));

    const res = await callHandler({ 'stripe-signature': 't=1,v1=ok' }, '{}');
    expect(res.status).toBe(200);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('add_audit_credits', {
      p_org_id: '00000000-0000-0000-0000-000000000001',
      p_amount: 1000
    });
  });

  it('skips the credit top-up when the invoice has no subscription field', async () => {
    // One-off invoices (e.g. manual charges) — nothing to credit.
    mockConstructEvent.mockReturnValue(invoicePaidEvent({ subscriptionId: null }));

    const res = await callHandler({ 'stripe-signature': 't=1,v1=ok' }, '{}');
    expect(res.status).toBe(200);
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('skips the credit top-up when the subscription is missing organization_id metadata', async () => {
    // Recovery scenario: a subscription was created outside the normal
    // checkout flow (e.g. Stripe Dashboard) and never got the metadata
    // stamp. We log and skip rather than credit a random org.
    mockConstructEvent.mockReturnValue(invoicePaidEvent({ subscriptionId: 'sub_orphan' }));
    mockSubscriptionsRetrieve.mockResolvedValue(fakeSubscription({ priceId: 'price_pro', orgId: null }));

    const res = await callHandler({ 'stripe-signature': 't=1,v1=ok' }, '{}');
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('skips the credit top-up when the subscription price id is not one of ours', async () => {
    // Plan that exists in Stripe but isn't mapped in our env. We log and
    // skip — the dedup layer still records the event for forensics.
    mockConstructEvent.mockReturnValue(invoicePaidEvent({ subscriptionId: 'sub_legacy' }));
    mockSubscriptionsRetrieve.mockResolvedValue(fakeSubscription({ priceId: 'price_legacy_unknown' }));

    const res = await callHandler({ 'stripe-signature': 't=1,v1=ok' }, '{}');
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns 200 (no Stripe retry) when add_audit_credits RPC errors', async () => {
    // The outer try/catch in the handler swallows the throw and returns
    // {handlerError:true}. Stripe should NOT retry — the audit-trail
    // event row is already inserted, retrying would just hammer us.
    mockConstructEvent.mockReturnValue(invoicePaidEvent({ subscriptionId: 'sub_rpc_fail' }));
    mockSubscriptionsRetrieve.mockResolvedValue(fakeSubscription({ priceId: 'price_pro' }));
    mockRpc.mockResolvedValueOnce({ error: { code: '42P01', message: 'relation does not exist' } });

    const res = await callHandler({ 'stripe-signature': 't=1,v1=ok' }, '{}');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handlerError).toBe(true);
  });

  it('records invoice.payment_failed without crediting', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_inv_failed',
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_failed', subscription: 'sub_x' } }
    });

    const res = await callHandler({ 'stripe-signature': 't=1,v1=ok' }, '{}');
    expect(res.status).toBe(200);
    // Audit trail row goes in, RPC stays untouched.
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
  });
});
