import { supabaseService } from '@/lib/supabase';

/**
 * Append-only access ledger.
 *
 * Every action that reads or destroys customer-owned plaintext (or
 * the encrypted document blob) writes one row here. The Settings →
 * Activité de sécurité page reads from this table so the customer
 * sees every access, including any LexyFlow staff access that may
 * happen for support reasons.
 *
 * Writes are best-effort — a failure to log MUST NOT cascade into
 * the calling request. We swallow errors and console.warn so the
 * monitoring layer sees them, but the user-facing operation
 * (audit, decrypt, delete) succeeds regardless.
 */
export type AccessAction = 'audit_created' | 'document_decrypted' | 'audit_deleted';

export interface AccessLogInput {
  organizationId: string;
  action: AccessAction;
  userId?: string | null;
  auditId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const ANONYMOUS_ORG_ID = '00000000-0000-0000-0000-000000000000';

export async function logAccess(input: AccessLogInput): Promise<void> {
  // Anonymous-org actions don't carry an authenticated user and are
  // intentionally public-by-UUID; logging them in the org's ledger
  // would create noise without value (the org has no humans to read
  // the log). Skip.
  if (input.organizationId === ANONYMOUS_ORG_ID) return;

  try {
    const { error } = await supabaseService().from('data_access_log').insert({
      organization_id: input.organizationId,
      user_id: input.userId ?? null,
      audit_id: input.auditId ?? null,
      action: input.action,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null
    });
    if (error) {
      console.warn('[access-log] insert failed', { code: error.code, message: error.message });
    }
  } catch (err) {
    console.warn('[access-log] insert threw', err instanceof Error ? err.message : String(err));
  }
}
