import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Stripe webhook handler tests. We isolate the route from the network by
 * mocking @/lib/stripe (signature verification) and @/lib/supabase
 * (idempotency table + business writes), so the test exercises only the
 * handler's branching logic.
 */

vi.mock('server-only', () => ({}));

type DbErr = { code: string; message: string } | null;
const mockConstructEvent = vi.fn();
const mockUpsert: ReturnType<typeof vi.fn> = vi.fn(async (_payload: unknown, _opts?: unknown) => ({ error: null as DbErr }));
const mockUpdate = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null as DbErr })) }));
const mockInsert: ReturnType<typeof vi.fn> = vi.fn(async (_row: unknown) => ({ error: null as DbErr }));

const tableHandlers: Record<string, () => unknown> = {
  organizations: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
  subscriptions: () => ({ upsert: mockUpsert, update: mockUpdate }),
  stripe_webhook_events: () => ({ insert: mockInsert })
};

vi.mock('@/lib/stripe', () => ({
  stripe: () => ({
    webhooks: { constructEvent: mockConstructEvent }
  })
}));

vi.mock('@/lib/supabase', () => ({
  supabaseService: () => ({
    from: (name: string) => tableHandlers[name]?.() ?? {}
  })
}));

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.STRIPE_PRICE_STARTER = 'price_starter';
  process.env.STRIPE_PRICE_PRO = 'price_pro';
  process.env.STRIPE_PRICE_ENTERPRISE = 'price_enterprise';

  mockConstructEvent.mockReset();
  mockUpsert.mockClear();
  mockUpdate.mockClear();
  mockInsert.mockReset();
  mockInsert.mockReturnValue(Promise.resolve({ error: null }));
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
  });

  it('returns 500 when the audit-trail insert fails for non-conflict reasons', async () => {
    mockConstructEvent.mockReturnValue({ id: 'evt_x', type: 'invoice.paid', data: { object: {} } });
    mockInsert.mockReturnValueOnce(Promise.resolve({ error: { code: '08006', message: 'connection lost' } }));

    const res = await callHandler({ 'stripe-signature': 't=1,v1=ok' }, '{}');
    expect(res.status).toBe(500);
  });
});

describe('Stripe webhook · dispatch', () => {
  it('routes customer.subscription.updated to subscriptions.upsert', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_sub_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          metadata: { organization_id: '00000000-0000-0000-0000-000000000001' },
          items: { data: [{ price: { id: 'price_pro' } }] },
          current_period_start: 1_700_000_000,
          current_period_end:   1_702_000_000,
          cancel_at: null,
          canceled_at: null
        }
      }
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
      data: {
        object: {
          id: 'sub_456',
          customer: 'cus_456',
          status: 'active',
          metadata: { organization_id: '00000000-0000-0000-0000-000000000001' },
          items: { data: [{ price: { id: 'price_unknown' } }] }
        }
      }
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

  it('records but does not act on invoice.* events', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_inv_1',
      type: 'invoice.paid',
      data: { object: {} }
    });

    const res = await callHandler({ 'stripe-signature': 't=1,v1=ok' }, '{}');
    expect(res.status).toBe(200);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    // Insert into stripe_webhook_events still happened as audit trail.
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});
