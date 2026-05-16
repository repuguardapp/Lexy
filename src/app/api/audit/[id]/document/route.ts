import { NextResponse } from 'next/server';
import { decryptDocument } from '@/lib/document-crypto';
import { supabaseService } from '@/lib/supabase';
import { getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';

/**
 * Decrypt and return the retained document for an audit.
 *
 * Auth: anonymous-org audits are public-by-UUID share-links and
 * intentionally never retain bytes (migration 0009 forces
 * organizations.retain_documents = false for that placeholder), so
 * they'll always return 404 here. Everything else requires the
 * caller's organization to match the audit's organization.
 *
 * Response shape mirrors the editor's expectations:
 *   200 → { text: string }
 *   404 → { error: 'no_retained_document' } when the audit row has no
 *         ciphertext (legacy audits, or org opted out of retention).
 *   401/404 on auth / lookup failures.
 *
 * The decrypted text is held in memory for the duration of the
 * response only. It's never logged.
 */
export const runtime = 'nodejs';

const ANONYMOUS_ORG_ID = '00000000-0000-0000-0000-000000000000';

interface AuditCryptoRow {
  id: string;
  organization_id: string;
  document_ciphertext: string | null;   // bytea returned by PostgREST as '\\xHEX'
  document_iv: string | null;
  document_auth_tag: string | null;
}

function fromBytea(hexLiteral: string): Buffer {
  // PostgREST returns bytea as the same hex literal we wrote: '\x…'.
  // Strip the prefix and decode.
  const hex = hexLiteral.startsWith('\\x') ? hexLiteral.slice(2) : hexLiteral;
  return Buffer.from(hex, 'hex');
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const db = supabaseService();

  const { data: auditRaw, error } = await db
    .from('audits')
    .select('id,organization_id,document_ciphertext,document_iv,document_auth_tag')
    .eq('id', params.id)
    .maybeSingle();

  if (error || !auditRaw) {
    return NextResponse.json({ error: 'audit_not_found' }, { status: 404 });
  }
  const audit = auditRaw as AuditCryptoRow;

  if (audit.organization_id === ANONYMOUS_ORG_ID) {
    return NextResponse.json({ error: 'no_retained_document' }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user || organizationIdFromUser(user) !== audit.organization_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!audit.document_ciphertext || !audit.document_iv || !audit.document_auth_tag) {
    return NextResponse.json({ error: 'no_retained_document' }, { status: 404 });
  }

  let plaintext: string;
  try {
    plaintext = decryptDocument({
      ciphertext: fromBytea(audit.document_ciphertext),
      iv: fromBytea(audit.document_iv),
      authTag: fromBytea(audit.document_auth_tag)
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'decrypt_failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { text: plaintext },
    {
      headers: {
        // Decrypted plaintext must never sit in a CDN or browser cache.
        'cache-control': 'no-store, no-cache, must-revalidate',
        pragma: 'no-cache'
      }
    }
  );
}
