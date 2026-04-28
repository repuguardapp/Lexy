/**
 * Rate limiter — fixed-window counter, in-memory, process-local.
 *
 * Design:
 *   - One Map shared across the warm function instance.
 *   - Each key has a `{ windowStart, count }` entry.
 *   - On each call, if the current window has expired, reset.
 *   - Returns whether the request is allowed plus retry metadata.
 *
 * Production note: a warm Node.js function on Vercel gives this map a
 * useful but bounded lifetime. For multi-instance correctness, swap the
 * `store` for Upstash Redis (`@upstash/ratelimit`) — the call surface
 * below stays the same.
 */

export interface RateLimitConfig {
  /** Bucket key, e.g. `audit:ip:1.2.3.4` or `audit:org:<uuid>`. */
  key: string;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Maximum number of allowed requests within the window. */
  max: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Remaining requests in the current window after this call. */
  remaining: number;
  /** UNIX ms timestamp when the current window resets. */
  resetAt: number;
}

const store = new Map<string, { windowStart: number; count: number }>();

export function rateLimit({ key, windowMs, max }: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    store.set(key, { windowStart: now, count: 1 });
    return { ok: true, remaining: max - 1, resetAt: now + windowMs };
  }

  existing.count += 1;
  const remaining = Math.max(0, max - existing.count);
  const resetAt = existing.windowStart + windowMs;

  if (existing.count > max) {
    return { ok: false, remaining: 0, resetAt };
  }
  return { ok: true, remaining, resetAt };
}

/** Test-only: clear the store between cases. */
export function __resetRateLimitStore() {
  store.clear();
}

/**
 * Best-effort client IP from request headers. Vercel and Cloudflare both
 * populate `x-forwarded-for`. Falls back to a stable placeholder so an
 * unknown peer is still rate-limited (rather than silently bypassing).
 */
export function clientIpFrom(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')
    ?? headers.get('cf-connecting-ip')
    ?? 'unknown';
}
