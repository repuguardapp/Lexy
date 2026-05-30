/**
 * Pure server-side paywall primitives, factored out of the audit
 * detail page so the slicing behaviour is unit-testable independently
 * of the React Server Component render path.
 *
 * Why this matters as its own module: the paywall is a security
 * surface, not a UX surface. The whole point of slicing here (rather
 * than hiding with CSS) is that the second-and-later findings must
 * not exist anywhere in the HTML response when the viewer is on the
 * free tier — otherwise a curl, a "view source", or the React Server
 * Components flight payload would leak them. Treating the cut as a
 * pure function lets us assert that contract directly in tests, and
 * lets any future caller (RSS, PDF export, embed, public-share view)
 * reuse the same enforcement without copy-pasting the predicate.
 */

export const ANONYMOUS_ORG_ID = '00000000-0000-0000-0000-000000000000';

export type ViewerTier = 'free' | 'paid';

export interface PaywallContext {
  /** Owning org of the audit row being rendered. */
  organizationId: string;
  /** True iff the viewer's session org id matches the audit row's. */
  viewerOwnsAudit: boolean;
  /** Tier the audit's owner is currently on. */
  viewerTier: ViewerTier;
}

/**
 * Decide whether to paywall this audit for this viewer.
 *
 * Three conditions all must hold:
 *   1. The audit isn't an anonymous-org public-share submission
 *      (those are share-link contracts and never get paywalled —
 *      they were created with no logged-in subject and have no
 *      tier to upgrade).
 *   2. The viewer is the owner. Non-owners hit the not-found path
 *      earlier in the request; this guard is defence-in-depth so
 *      that if a future refactor accidentally lets a non-owner
 *      through, they still don't see the full unpaywalled report.
 *   3. The owner's tier is free.
 */
export function isPaywalled(ctx: PaywallContext): boolean {
  return (
    ctx.organizationId !== ANONYMOUS_ORG_ID &&
    ctx.viewerOwnsAudit &&
    ctx.viewerTier === 'free'
  );
}

export interface PaywallSlice<T> {
  /** Rows that will be rendered. Always >= 1 when input is non-empty. */
  visible: T[];
  /** Rows withheld behind the upgrade CTA. Always 0 when not paywalled. */
  hidden: number;
}

/**
 * Apply the paywall cut to a list of findings (or any row collection
 * with the same shape).
 *
 * Contract — the things tests pin:
 *   • paywalled=false → visible === input rows, hidden === 0. No-op.
 *   • paywalled=true  → visible has at most 1 row (the teaser),
 *                       hidden === max(0, rows.length - 1).
 *   • Empty input     → visible === [], hidden === 0 even when
 *                       paywalled (no "negative" hidden count).
 *
 * The function never mutates its input; the slice is a fresh array.
 */
export function applyPaywall<T>(rows: readonly T[], paywalled: boolean): PaywallSlice<T> {
  if (!paywalled) {
    return { visible: [...rows], hidden: 0 };
  }
  const visible = rows.slice(0, 1);
  const hidden = Math.max(0, rows.length - visible.length);
  return { visible, hidden };
}
