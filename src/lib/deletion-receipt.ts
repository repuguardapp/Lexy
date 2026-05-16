import { createHash, createHmac } from 'node:crypto';

/**
 * Tamper-evident receipts for "Delete forever" actions.
 *
 * When a user deletes an audit we (a) actually delete the row
 * (cascades to findings + ciphertext), (b) record a hashed mention
 * of the deleted id in `deletion_log`, and (c) hand the user a
 * signed receipt JSON. The receipt is structured so that ANY future
 * dispute can be resolved with two facts:
 *
 *   1. The customer presents the receipt (containing the audit id,
 *      the deletion timestamp, and the signature).
 *   2. We re-derive the signature locally from
 *      HMAC-SHA256(DOCUMENT_ENCRYPTION_KEY, `${sha256(audit_id)}|${deleted_at}`)
 *      and confirm it matches. Only we hold the master key, so a
 *      matching signature proves we issued the receipt.
 *
 * Privacy choice: the deletion_log row stores SHA-256(audit_id), not
 * the raw id. That way a leak of the deletion ledger does not
 * itself become a re-identification vector (the attacker would need
 * to brute-force the original UUID space to match a hash to a known
 * id). The customer keeps the cleartext id in their receipt.
 */

export interface DeletionReceipt {
  /** Receipt format version — bump if the signed-string shape changes. */
  version: 1;
  /** The deleted audit's cleartext UUID. Only the customer ever sees this. */
  auditId: string;
  /** SHA-256 hex of auditId — matches the row we keep in deletion_log. */
  auditIdHash: string;
  /** ISO-8601 UTC timestamp of when LexyFlow processed the deletion. */
  deletedAt: string;
  /** HMAC-SHA256 hex of `${auditIdHash}|${deletedAt}` signed with the master key. */
  signature: string;
  /** Algorithm tag so future verifiers know what we used. */
  algorithm: 'HMAC-SHA256';
  /** The legal entity that issued the receipt. Stable for the receipt's life. */
  issuer: 'LexyFlow';
}

function masterKey(): Buffer {
  const b64 = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error('DOCUMENT_ENCRYPTION_KEY is not configured — cannot issue deletion receipts');
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error('DOCUMENT_ENCRYPTION_KEY must decode to 32 bytes');
  }
  return key;
}

export function hashAuditId(auditId: string): string {
  return createHash('sha256').update(auditId, 'utf8').digest('hex');
}

export function signDeletionReceipt(auditId: string, deletedAt: string): DeletionReceipt {
  const auditIdHash = hashAuditId(auditId);
  const signature = createHmac('sha256', masterKey())
    .update(`${auditIdHash}|${deletedAt}`, 'utf8')
    .digest('hex');
  return {
    version: 1,
    auditId,
    auditIdHash,
    deletedAt,
    signature,
    algorithm: 'HMAC-SHA256',
    issuer: 'LexyFlow'
  };
}

/**
 * Re-derive the signature from a receipt's fields and confirm it
 * matches. Used by the verification endpoint a customer might call
 * to challenge LexyFlow's claim that a deletion happened.
 */
export function verifyDeletionReceipt(receipt: DeletionReceipt): boolean {
  if (receipt.version !== 1 || receipt.algorithm !== 'HMAC-SHA256') return false;
  if (hashAuditId(receipt.auditId) !== receipt.auditIdHash) return false;
  const expected = createHmac('sha256', masterKey())
    .update(`${receipt.auditIdHash}|${receipt.deletedAt}`, 'utf8')
    .digest('hex');
  return expected === receipt.signature;
}
