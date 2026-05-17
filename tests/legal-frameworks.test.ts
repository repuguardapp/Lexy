import { describe, expect, it } from 'vitest';
import { FRAMEWORKS, frameworksForCountry } from '../src/lib/legal-frameworks';

describe('frameworksForCountry', () => {
  it('returns LGPD for BR', () => {
    expect(frameworksForCountry('BR').map((f) => f.id)).toContain('lgpd');
  });

  it('returns APPI for JP', () => {
    expect(frameworksForCountry('JP').map((f) => f.id)).toContain('appi');
  });

  it('returns GDPR + AI Act for EU members', () => {
    const ids = frameworksForCountry('FR').map((f) => f.id);
    expect(ids).toContain('gdpr');
    expect(ids).toContain('eu_ai_act');
  });

  it('is case-insensitive', () => {
    expect(frameworksForCountry('jp').length).toBeGreaterThan(0);
  });

  it('returns empty for unmapped countries', () => {
    expect(frameworksForCountry('XX').length).toBe(0);
  });

  it('exposes only distinct framework IDs', () => {
    expect(new Set(FRAMEWORKS.map((f) => f.id)).size).toBe(FRAMEWORKS.length);
  });

  it('covers all six GCC member states', () => {
    for (const cc of ['SA', 'AE', 'BH', 'KW', 'OM', 'QA']) {
      expect(frameworksForCountry(cc).length).toBeGreaterThan(0);
    }
  });

  it('returns Qatar PDPPL for QA', () => {
    expect(frameworksForCountry('QA').map((f) => f.id)).toContain('qatar_pdppl');
  });
});
