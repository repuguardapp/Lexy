/**
 * Mapping of legal frameworks the Multi-Pass engine can audit against.
 * The mapping is driven by `country` (jurisdiction of the controller) rather
 * than by UI locale — a Brazilian user reading the dashboard in English still
 * gets an LGPD audit if their org is registered in BR.
 */
export type FrameworkId =
  | 'gdpr'
  | 'eu_ai_act'
  | 'lgpd'
  | 'appi'
  | 'ccpa'
  | 'pipeda'
  | 'uk_gdpr'
  | 'qatar_pdppl'
  | 'saudi_pdpl'
  | 'uae_pdpl'
  | 'bahrain_pdpl'
  | 'kuwait_dppr'
  | 'oman_pdpl';

export interface LegalFramework {
  id: FrameworkId;
  name: string;
  jurisdiction: string;
  /** ISO-3166-1 alpha-2 codes where this framework applies. */
  countries: readonly string[];
  citationStyle: 'article' | 'section' | 'chapter';
  authority: string;
}

export const FRAMEWORKS: readonly LegalFramework[] = [
  {
    id: 'gdpr',
    name: 'General Data Protection Regulation',
    jurisdiction: 'EU',
    countries: ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'],
    citationStyle: 'article',
    authority: 'European Data Protection Board'
  },
  {
    id: 'eu_ai_act',
    name: 'EU AI Act (Regulation 2024/1689)',
    jurisdiction: 'EU',
    countries: ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'],
    citationStyle: 'article',
    authority: 'European AI Office'
  },
  {
    id: 'lgpd',
    name: 'Lei Geral de Proteção de Dados',
    jurisdiction: 'BR',
    countries: ['BR'],
    citationStyle: 'article',
    authority: 'ANPD'
  },
  {
    id: 'appi',
    name: 'Act on the Protection of Personal Information',
    jurisdiction: 'JP',
    countries: ['JP'],
    citationStyle: 'article',
    authority: 'Personal Information Protection Commission'
  },
  {
    id: 'ccpa',
    name: 'California Consumer Privacy Act / CPRA',
    jurisdiction: 'US-CA',
    countries: ['US'],
    citationStyle: 'section',
    authority: 'California Privacy Protection Agency'
  },
  {
    id: 'pipeda',
    name: 'Personal Information Protection and Electronic Documents Act',
    jurisdiction: 'CA',
    countries: ['CA'],
    citationStyle: 'section',
    authority: 'Office of the Privacy Commissioner of Canada'
  },
  {
    id: 'uk_gdpr',
    name: 'UK GDPR + Data Protection Act 2018',
    jurisdiction: 'UK',
    countries: ['GB'],
    citationStyle: 'article',
    authority: "Information Commissioner's Office"
  },
  {
    id: 'qatar_pdppl',
    name: 'Qatar PDPPL (Personal Data Privacy Protection Law - Law No. 13 of 2016)',
    jurisdiction: 'QA',
    countries: ['QA'],
    citationStyle: 'article',
    authority: 'National Cyber Security Agency (NCSA) — Compliance and Data Protection Department'
  },
  {
    id: 'saudi_pdpl',
    name: 'Saudi PDPL (Personal Data Protection Law - Royal Decree M/19, as amended 2023)',
    jurisdiction: 'SA',
    countries: ['SA'],
    citationStyle: 'article',
    authority: 'Saudi Data & AI Authority (SDAIA)'
  },
  {
    id: 'uae_pdpl',
    name: 'UAE PDPL (Federal Decree-Law No. 45 of 2021 on Personal Data Protection)',
    jurisdiction: 'AE',
    countries: ['AE'],
    citationStyle: 'article',
    authority: 'UAE Data Office'
  },
  {
    id: 'bahrain_pdpl',
    name: 'Bahrain PDPL (Personal Data Protection Law - Law No. 30 of 2018)',
    jurisdiction: 'BH',
    countries: ['BH'],
    citationStyle: 'article',
    authority: 'Personal Data Protection Authority (PDPA)'
  },
  {
    id: 'kuwait_dppr',
    name: 'Kuwait DPPR (Data Privacy Protection Regulation - CITRA Resolution No. 26 of 2024)',
    jurisdiction: 'KW',
    countries: ['KW'],
    citationStyle: 'article',
    authority: 'Communication and Information Technology Regulatory Authority (CITRA)'
  },
  {
    id: 'oman_pdpl',
    name: 'Oman PDPL (Personal Data Protection Law - Royal Decree No. 6 of 2022)',
    jurisdiction: 'OM',
    countries: ['OM'],
    citationStyle: 'article',
    authority: 'Ministry of Transport, Communications and Information Technology (MTCIT)'
  }
];

export function frameworksForCountry(country: string): LegalFramework[] {
  const upper = country.toUpperCase();
  return FRAMEWORKS.filter((f) => f.countries.includes(upper));
}

export function frameworkById(id: FrameworkId): LegalFramework | undefined {
  return FRAMEWORKS.find((f) => f.id === id);
}
