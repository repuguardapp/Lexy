import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  hashAuditId,
  signDeletionReceipt,
  verifyDeletionReceipt
} from '../src/lib/deletion-receipt';

const TEST_KEY = randomBytes(32).toString('base64');
let savedKey: string | undefined;

beforeEach(() => {
  savedKey = process.env.DOCUMENT_ENCRYPTION_KEY;
  process.env.DOCUMENT_ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.DOCUMENT_ENCRYPTION_KEY;
  else process.env.DOCUMENT_ENCRYPTION_KEY = savedKey;
});

describe('deletion receipt', () => {
  it('produces deterministic hash for the same audit id', () => {
    const id = randomUUID();
    expect(hashAuditId(id)).toBe(hashAuditId(id));
  });

  it('produces different hashes for different audit ids', () => {
    expect(hashAuditId(randomUUID())).not.toBe(hashAuditId(randomUUID()));
  });

  it('signs and verifies a receipt round-trip', () => {
    const receipt = signDeletionReceipt(randomUUID(), '2026-05-16T15:00:00.000Z');
    expect(receipt.version).toBe(1);
    expect(receipt.algorithm).toBe('HMAC-SHA256');
    expect(receipt.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyDeletionReceipt(receipt)).toBe(true);
  });

  it('detects tampered signature', () => {
    const receipt = signDeletionReceipt(randomUUID(), '2026-05-16T15:00:00.000Z');
    const tampered = { ...receipt, signature: '0'.repeat(64) };
    expect(verifyDeletionReceipt(tampered)).toBe(false);
  });

  it('detects tampered timestamp (signature no longer matches)', () => {
    const receipt = signDeletionReceipt(randomUUID(), '2026-05-16T15:00:00.000Z');
    const tampered = { ...receipt, deletedAt: '2030-01-01T00:00:00.000Z' };
    expect(verifyDeletionReceipt(tampered)).toBe(false);
  });

  it('detects tampered audit id (hash no longer matches)', () => {
    const receipt = signDeletionReceipt(randomUUID(), '2026-05-16T15:00:00.000Z');
    const tampered = { ...receipt, auditId: randomUUID() };
    expect(verifyDeletionReceipt(tampered)).toBe(false);
  });

  it('rejects receipts with unknown version', () => {
    const receipt = signDeletionReceipt(randomUUID(), '2026-05-16T15:00:00.000Z');
    expect(verifyDeletionReceipt({ ...receipt, version: 99 as 1 })).toBe(false);
  });

  it('refuses to issue when the master key is missing', () => {
    delete process.env.DOCUMENT_ENCRYPTION_KEY;
    expect(() => signDeletionReceipt(randomUUID(), '2026-01-01T00:00:00Z')).toThrow(
      /DOCUMENT_ENCRYPTION_KEY/
    );
  });
});
