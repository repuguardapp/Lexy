import 'server-only';

/**
 * Email allowlist for /admin/* routes.
 *
 * Reads the comma-separated `ADMIN_EMAILS` env var. Empty/missing means
 * "no admin access" — never an open admin in production.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = process.env.ADMIN_EMAILS;
  if (!allow) return false;
  const set = new Set(
    allow.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  );
  return set.has(email.trim().toLowerCase());
}
