import { afterEach, describe, expect, it } from 'vitest';
import { __resetRateLimitStore, clientIpFrom, rateLimit } from '../src/lib/rate-limit';

afterEach(() => __resetRateLimitStore());

describe('rateLimit', () => {
  it('allows up to `max` calls within the window', () => {
    const cfg = { key: 't1', windowMs: 60_000, max: 3 };
    expect(rateLimit(cfg).ok).toBe(true);
    expect(rateLimit(cfg).ok).toBe(true);
    expect(rateLimit(cfg).ok).toBe(true);
  });

  it('rejects the next call once the cap is hit', () => {
    const cfg = { key: 't2', windowMs: 60_000, max: 2 };
    expect(rateLimit(cfg).ok).toBe(true);
    expect(rateLimit(cfg).ok).toBe(true);
    const blocked = rateLimit(cfg);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('isolates buckets', () => {
    const a = rateLimit({ key: 'A', windowMs: 60_000, max: 1 });
    const b = rateLimit({ key: 'B', windowMs: 60_000, max: 1 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it('exposes a sane remaining + resetAt', () => {
    const t0 = Date.now();
    const r = rateLimit({ key: 'R', windowMs: 1_000, max: 5 });
    expect(r.remaining).toBe(4);
    expect(r.resetAt).toBeGreaterThanOrEqual(t0 + 999);
  });
});

describe('clientIpFrom', () => {
  it('takes the first entry from x-forwarded-for', () => {
    const h = new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' });
    expect(clientIpFrom(h)).toBe('1.2.3.4');
  });

  it('falls through to x-real-ip', () => {
    const h = new Headers({ 'x-real-ip': '5.6.7.8' });
    expect(clientIpFrom(h)).toBe('5.6.7.8');
  });

  it('uses cf-connecting-ip as final fallback', () => {
    const h = new Headers({ 'cf-connecting-ip': '9.9.9.9' });
    expect(clientIpFrom(h)).toBe('9.9.9.9');
  });

  it('returns "unknown" when no header is present', () => {
    expect(clientIpFrom(new Headers())).toBe('unknown');
  });
});
