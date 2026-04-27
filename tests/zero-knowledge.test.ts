import { describe, expect, it } from 'vitest';
import { anonymize, hashDocument, withEphemeralDocument, wipeBuffer } from '../src/lib/zero-knowledge';

describe('Zero-Knowledge primitives', () => {
  it('anonymizes common PII patterns', () => {
    const input = 'Contact alice@example.com or +1 (415) 555-2671. CPF 123.456.789-00.';
    const { text, redactionCount } = anonymize(input);
    expect(text).not.toContain('alice@example.com');
    expect(text).not.toContain('123.456.789-00');
    expect(redactionCount).toBeGreaterThanOrEqual(3);
  });

  it('produces a stable sha-256 hash', () => {
    expect(hashDocument('hello')).toBe(hashDocument('hello'));
    expect(hashDocument('hello')).not.toBe(hashDocument('Hello'));
  });

  it('wipes the buffer when the work is done', () => {
    const buf = Buffer.from('top secret');
    wipeBuffer(buf);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  it('withEphemeralDocument wipes even on throw', async () => {
    const buf = Buffer.from('payload');
    await expect(
      withEphemeralDocument(buf, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(buf.every((b) => b === 0)).toBe(true);
  });
});
