import { describe, expect, it, vi } from 'vitest';
import { getTierForOrg } from '../src/lib/tier';

/**
 * Tier classification — exercises every branch without a real DB.
 *
 * We pass a hand-rolled mock that mimics supabase-js's chained API
 * surface for the SELECT we issue inside getTierForOrg. Keeps the
 * test hermetic and instantaneous.
 */
function mockDb(row: { plan: string | null; status: string | null } | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row })
        })
      })
    })
  } as unknown as Parameters<typeof getTierForOrg>[0];
}

describe('getTierForOrg', () => {
  it('returns free when no subscription row exists', async () => {
    expect(await getTierForOrg(mockDb(null), 'org_1')).toBe('free');
  });

  it('returns free when plan is null', async () => {
    expect(await getTierForOrg(mockDb({ plan: null, status: 'active' }), 'org_1')).toBe('free');
  });

  it('returns free when status is null', async () => {
    expect(await getTierForOrg(mockDb({ plan: 'pro', status: null }), 'org_1')).toBe('free');
  });

  it('returns free when plan is unknown', async () => {
    expect(await getTierForOrg(mockDb({ plan: 'mystery', status: 'active' }), 'org_1')).toBe('free');
  });

  it('returns free when status is canceled', async () => {
    expect(await getTierForOrg(mockDb({ plan: 'pro', status: 'canceled' }), 'org_1')).toBe('free');
  });

  it('returns paid for active pro', async () => {
    expect(await getTierForOrg(mockDb({ plan: 'pro', status: 'active' }), 'org_1')).toBe('paid');
  });

  it('returns paid for trialing enterprise', async () => {
    expect(await getTierForOrg(mockDb({ plan: 'enterprise', status: 'trialing' }), 'org_1')).toBe('paid');
  });

  it('returns paid for past_due starter (dunning grace window)', async () => {
    expect(await getTierForOrg(mockDb({ plan: 'starter', status: 'past_due' }), 'org_1')).toBe('paid');
  });
});
