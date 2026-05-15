import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Envelope encryption for retained audit documents.
 *
 * Algorithm:        AES-256-GCM (authenticated encryption — tampered
 *                   ciphertext fails to decrypt).
 * Key:              32-byte master key held in env var
 *                   DOCUMENT_ENCRYPTION_KEY, base64-encoded. Single
 *                   key for v1; rotation is a future migration (re-
 *                   encrypt rows under the new key, then drop the old).
 * IV:               12 random bytes per row (GCM standard).
 * Auth tag:         16 bytes from cipher.getAuthTag(); stored in a
 *                   separate column so corruption is detectable.
 *
 * The plaintext is the UTF-8 document text. We deliberately do NOT
 * accept Buffers here — callers pass the extracted string from the
 * audit pipeline, which is already in JS heap and will be GC'd when
 * the request scope ends.
 */

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

function masterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const b64 = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      'DOCUMENT_ENCRYPTION_KEY is not configured. ' +
      'Generate a 32-byte key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`DOCUMENT_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`);
  }
  cachedKey = key;
  return key;
}

export interface EncryptedDocument {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export function encryptDocument(plaintext: string): EncryptedDocument {
  if (typeof plaintext !== 'string') {
    throw new TypeError('encryptDocument: plaintext must be a string');
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

export function decryptDocument(enc: EncryptedDocument): string {
  if (enc.iv.length !== IV_BYTES) {
    throw new Error(`decryptDocument: iv must be ${IV_BYTES} bytes`);
  }
  if (enc.authTag.length !== TAG_BYTES) {
    throw new Error(`decryptDocument: authTag must be ${TAG_BYTES} bytes`);
  }
  const decipher = createDecipheriv(ALGO, masterKey(), enc.iv);
  decipher.setAuthTag(enc.authTag);
  return Buffer.concat([decipher.update(enc.ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Test-only reset of the cached key. Lets the round-trip unit test
 * verify error paths (missing/invalid env var) without leaking state
 * across test files. Not exported via the lib's public surface — this
 * is module-internal by intent (callers reach for it only from tests).
 */
export function __resetKeyCacheForTests(): void {
  cachedKey = null;
}
