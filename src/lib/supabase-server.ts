import 'server-only';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase client for App-Router server components and Route Handlers.
 *
 * - Reads the session from the encrypted Supabase cookies set during the
 *   magic-link callback.
 * - Writes refreshed cookies back when Supabase rotates the access token.
 * - Falls into a no-op cookie store when called from a Server Component
 *   (where cookies are read-only) — the next request resolves the refresh.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Supabase public env not configured');

  return createServerClient(url, anon, {
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value;
      },
      set(name, value, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Read-only context (Server Component) — the next Route Handler
          // call will re-write the cookie. Safe to swallow.
        }
      },
      remove(name, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options, maxAge: 0 });
        } catch {
          // Same rationale as above.
        }
      }
    }
  });
}

/**
 * Returns the authenticated user, or null. Use `requireUser()` when you
 * want a redirect to /login on miss.
 */
export async function getCurrentUser() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

/**
 * Returns the org id stamped in `app_metadata.organization_id`. The
 * onboarding flow writes this once, then it travels in every JWT and
 * powers Postgres RLS.
 */
export function organizationIdFromUser(user: { app_metadata: Record<string, unknown> | null }): string | null {
  const meta = user.app_metadata ?? {};
  const id = (meta as { organization_id?: unknown }).organization_id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
