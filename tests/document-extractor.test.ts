import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { classify, normalise, extractText } = await import('../src/lib/document-extractor');

describe('classify', () => {
  it('detects pdf by extension', () => {
    expect(classify('policy.pdf', undefined)).toBe('pdf');
    expect(classify('POLICY.PDF', undefined)).toBe('pdf');
  });

  it('detects docx by extension', () => {
    expect(classify('contract.docx', undefined)).toBe('docx');
  });

  it('detects markdown by extension', () => {
    expect(classify('readme.md', undefined)).toBe('markdown');
    expect(classify('book.markdown', undefined)).toBe('markdown');
  });

  it('detects text by extension', () => {
    expect(classify('terms.txt', undefined)).toBe('text');
  });

  it('falls back to MIME when extension is missing', () => {
    expect(classify(undefined, 'application/pdf')).toBe('pdf');
    expect(classify(undefined, 'text/plain')).toBe('text');
  });

  it('throws on unsupported types', () => {
    expect(() => classify('photo.jpg', 'image/jpeg')).toThrow(/Unsupported/);
  });
});

describe('normalise', () => {
  it('strips zero-width chars and collapses whitespace', () => {
    expect(normalise('a   b\r\nc\n\n\n\nd')).toBe('a b\nc\n\nd');
  });

  it('trims edges', () => {
    expect(normalise('   hello   ')).toBe('hello');
  });
});

describe('extractText (text + markdown paths)', () => {
  it('reads UTF-8 plain text', async () => {
    const buf = Buffer.from('# Privacy Policy\n\nWe collect data lawfully under GDPR Art. 6.', 'utf-8');
    const out = await extractText(buf, { filename: 'policy.txt' });
    expect(out.type).toBe('text');
    expect(out.text).toContain('Privacy Policy');
    expect(out.charCount).toBeGreaterThan(20);
  });

  it('rejects too-short documents (likely empty / scanned)', async () => {
    const buf = Buffer.from('hi', 'utf-8');
    await expect(extractText(buf, { filename: 'empty.txt' })).rejects.toThrow(/too little text/);
  });
});
