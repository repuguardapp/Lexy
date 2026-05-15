import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  __resetKeyCacheForTests,
  decryptDocument,
  encryptDocument
} from '../src/lib/document-crypto';

/**
 * The lib reads DOCUMENT_ENCRYPTION_KEY once and caches it. These
 * tests swap the env var between cases, so we reset the module cache
 * around each run to keep them isolated.
 */
const TEST_KEY = randomBytes(32).toString('base64');
let savedKey: string | undefined;

beforeEach(() => {
  savedKey = process.env.DOCUMENT_ENCRYPTION_KEY;
  process.env.DOCUMENT_ENCRYPTION_KEY = TEST_KEY;
  __resetKeyCacheForTests();
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.DOCUMENT_ENCRYPTION_KEY;
  else process.env.DOCUMENT_ENCRYPTION_KEY = savedKey;
  __resetKeyCacheForTests();
});

describe('document envelope crypto', () => {
  it('round-trips arbitrary UTF-8 text', () => {
    const plaintext = 'Politique de confidentialité — Article 1: 個人情報の取扱い ✓';
    const enc = encryptDocument(plaintext);
    expect(decryptDocument(enc)).toBe(plaintext);
  });

  it('produces a 12-byte IV and a 16-byte auth tag', () => {
    const enc = encryptDocument('anything');
    expect(enc.iv.length).toBe(12);
    expect(enc.authTag.length).toBe(16);
  });

  it('uses a fresh IV per call (no nonce reuse)', () => {
    const a = encryptDocument('same plaintext');
    const b = encryptDocument('same plaintext');
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('refuses to decrypt when the auth tag is tampered', () => {
    const enc = encryptDocument('top secret clause');
    enc.authTag[0] = enc.authTag[0]! ^ 0xff;
    expect(() => decryptDocument(enc)).toThrow();
  });

  it('refuses to decrypt when the ciphertext is tampered', () => {
    const enc = encryptDocument('top secret clause');
    enc.ciphertext[0] = enc.ciphertext[0]! ^ 0xff;
    expect(() => decryptDocument(enc)).toThrow();
  });

  it('throws when the env key is missing', () => {
    delete process.env.DOCUMENT_ENCRYPTION_KEY;
    __resetKeyCacheForTests();
    expect(() => encryptDocument('x')).toThrow(/DOCUMENT_ENCRYPTION_KEY/);
  });

  it('throws when the env key is the wrong length', () => {
    process.env.DOCUMENT_ENCRYPTION_KEY = Buffer.from('too short').toString('base64');
    __resetKeyCacheForTests();
    expect(() => encryptDocument('x')).toThrow(/32 bytes/);
  });

  /**
   * End-to-end wire-format test. The audit route serializes the
   * encrypted fields as Postgres bytea hex literals ('\\xHEX') before
   * the INSERT; the decrypt endpoint reads them back as the same
   * literals from PostgREST. This test simulates the full transit
   * through that wire format without touching a real database.
   */
  it('round-trips through the Postgres bytea hex literal wire format', () => {
    const plaintext = [
      'PRIVACY POLICY',
      'Article 1 — We collect: name, email, IP address.',
      'Article 2 — Data is retained 24 months.',
      'Article 3 — Third-party processors: Stripe, Anthropic, OpenAI.'
    ].join('\n');

    // 1. Audit-route encrypts
    const enc = encryptDocument(plaintext);

    // 2. Audit-route serializes to bytea hex literals
    const toBytea = (b: Buffer) => `\\x${b.toString('hex')}`;
    const rowOnWire = {
      document_ciphertext: toBytea(enc.ciphertext),
      document_iv: toBytea(enc.iv),
      document_auth_tag: toBytea(enc.authTag)
    };

    // Sanity: PostgREST emits the same '\\x…' format on the way back,
    // so what we'd insert is byte-identical to what we'd read.
    expect(rowOnWire.document_iv.startsWith('\\x')).toBe(true);
    expect(rowOnWire.document_iv.length - 2).toBe(12 * 2); // 12 bytes = 24 hex chars
    expect(rowOnWire.document_auth_tag.length - 2).toBe(16 * 2);

    // 3. Decrypt-endpoint parses bytea hex back to Buffers
    const fromBytea = (hexLiteral: string) =>
      Buffer.from(
        hexLiteral.startsWith('\\x') ? hexLiteral.slice(2) : hexLiteral,
        'hex'
      );
    const recovered = decryptDocument({
      ciphertext: fromBytea(rowOnWire.document_ciphertext),
      iv: fromBytea(rowOnWire.document_iv),
      authTag: fromBytea(rowOnWire.document_auth_tag)
    });

    // 4. Verify the document survived the full transit
    expect(recovered).toBe(plaintext);
  });
});
