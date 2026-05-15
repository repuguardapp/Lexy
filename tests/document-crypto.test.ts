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
});
