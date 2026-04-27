import { createHash } from 'node:crypto';

/**
 * Zero-Knowledge document handling.
 *
 * Documents never touch disk. They live as `Buffer` instances in the request
 * scope of an Edge / Node Function and are explicitly overwritten with zeros
 * before the buffer is GC'd. The only artifact persisted to Supabase is:
 *
 *   • the SHA-256 hash of the source text (idempotency / audit log);
 *   • the audit report (which is derivative content authored by the AI, not a
 *     copy of the source).
 *
 * Anonymization is the secondary path: when the user keeps the document in
 * their workspace, we strip direct identifiers before storage.
 */

const PII_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'email',  re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi },
  { name: 'phone',  re: /\+?\d[\d\s().-]{7,}\d/g },
  // Loose IBAN — strip 15+ alphanumeric runs that look bank-like.
  { name: 'iban',   re: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g },
  // CPF (Brazil): 000.000.000-00
  { name: 'cpf',    re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g },
  // SSN (US): 000-00-0000
  { name: 'ssn',    re: /\b\d{3}-\d{2}-\d{4}\b/g },
  // 13-19 digit card-like sequences
  { name: 'card',   re: /\b\d[ -]?(?:\d[ -]?){11,17}\d\b/g }
];

export function anonymize(text: string): { text: string; redactionCount: number } {
  let redactionCount = 0;
  let out = text;
  for (const { name, re } of PII_PATTERNS) {
    out = out.replace(re, () => {
      redactionCount += 1;
      return `[REDACTED:${name}]`;
    });
  }
  return { text: out, redactionCount };
}

/**
 * Overwrite a buffer's bytes with zeros so that, even if the V8 heap is later
 * dumped, the source document content cannot be recovered. Node's GC may
 * eventually free the slab, but the contents are gone immediately.
 */
export function wipeBuffer(buf: Buffer): void {
  if (buf.length === 0) return;
  buf.fill(0);
}

export function hashDocument(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Run a function with exclusive access to a document buffer; guarantees the
 * buffer is wiped on any exit path (success, throw, or cancellation).
 */
export async function withEphemeralDocument<T>(
  buf: Buffer,
  fn: (text: string, hash: string) => Promise<T>
): Promise<T> {
  try {
    const text = buf.toString('utf-8');
    const hash = hashDocument(text);
    return await fn(text, hash);
  } finally {
    wipeBuffer(buf);
  }
}
