/**
 * Single source of truth for the sub-processors LexyFlow uses.
 *
 * Mirrors what the Privacy Policy and DPA reference; both pages should
 * be updated alongside this file when a new sub-processor is added or
 * removed (we promise customers 30 days' notice on changes).
 */

export type DataCategory = 'document_text' | 'account' | 'billing' | 'email' | 'errors';

export interface SubProcessor {
  name: string;
  legalName: string;
  role: string;
  url: string;
  region: string;
  /** What we actually send to this provider. */
  dataCategories: readonly DataCategory[];
  certifications: readonly string[];
  /** Cross-border transfer mechanism, if any. */
  transferMechanism?: string;
  dpaUrl?: string;
  /** Why we use them — public-facing explanation. */
  purpose: string;
}

export const SUB_PROCESSORS: readonly SubProcessor[] = [
  {
    name: 'Anthropic',
    legalName: 'Anthropic, PBC',
    role: 'AI · Pass 1 (audit)',
    url: 'https://www.anthropic.com',
    region: 'United States',
    dataCategories: ['document_text'],
    certifications: ['SOC 2 Type II', 'ISO 27001', 'HIPAA-aligned'],
    transferMechanism: 'EU SCCs (2021/914) + UK IDTA',
    dpaUrl: 'https://www.anthropic.com/legal/dpa',
    purpose:
      'Runs the Multi-Pass legal analysis (Claude 3.5 Sonnet). Anthropic does not train on API/Business traffic.'
  },
  {
    name: 'OpenAI',
    legalName: 'OpenAI, L.L.C.',
    role: 'AI · Pass 2 (localisation)',
    url: 'https://openai.com',
    region: 'United States',
    dataCategories: ['document_text'],
    certifications: ['SOC 2 Type II', 'ISO 27001'],
    transferMechanism: 'EU SCCs (2021/914) + UK IDTA',
    dpaUrl: 'https://openai.com/policies/data-processing-addendum',
    purpose:
      'Localises the audit report into any BCP-47 language (GPT-4o). Zero data retention enabled on our API key.'
  },
  {
    name: 'Supabase',
    legalName: 'Supabase Inc.',
    role: 'Database & authentication',
    url: 'https://supabase.com',
    region: 'European Union (Paris) for the LexyFlow project',
    dataCategories: ['account', 'errors'],
    certifications: ['SOC 2 Type II', 'HIPAA-aligned'],
    dpaUrl: 'https://supabase.com/legal/dpa',
    purpose: 'Stores the audit reports, organisation metadata and authentication state.'
  },
  {
    name: 'Stripe',
    legalName: 'Stripe Payments Europe Ltd.',
    role: 'Billing',
    url: 'https://stripe.com',
    region: 'Ireland (EU)',
    dataCategories: ['billing'],
    certifications: ['PCI DSS Level 1', 'SOC 2 Type II', 'ISO 27001'],
    dpaUrl: 'https://stripe.com/legal/dpa',
    purpose: 'Processes subscription payments, multi-currency pricing and tax compliance.'
  },
  {
    name: 'Vercel',
    legalName: 'Vercel Inc.',
    role: 'Hosting · edge network',
    url: 'https://vercel.com',
    region: 'Edge: global · Functions: Paris (cdg1)',
    dataCategories: ['account', 'errors'],
    certifications: ['SOC 2 Type II', 'ISO 27001', 'HIPAA-aligned'],
    transferMechanism: 'EU SCCs (2021/914)',
    dpaUrl: 'https://vercel.com/legal/dpa',
    purpose:
      'Serves the LexyFlow application; the audit pipeline runs in EU functions (cdg1) by configuration.'
  },
  {
    name: 'Resend',
    legalName: 'Resend Labs Inc.',
    role: 'Transactional email',
    url: 'https://resend.com',
    region: 'United States',
    dataCategories: ['email'],
    certifications: ['SOC 2 Type II'],
    transferMechanism: 'EU SCCs (2021/914)',
    dpaUrl: 'https://resend.com/legal/dpa',
    purpose: 'Delivers magic-link sign-in emails and audit-completion notifications.'
  },
  {
    name: 'Sentry',
    legalName: 'Functional Software Inc. (dba Sentry)',
    role: 'Error monitoring',
    url: 'https://sentry.io',
    region: 'United States · EU data residency available',
    dataCategories: ['errors'],
    certifications: ['SOC 2 Type II', 'ISO 27001', 'HIPAA-aligned'],
    transferMechanism: 'EU SCCs (2021/914)',
    dpaUrl: 'https://sentry.io/legal/dpa',
    purpose:
      'Captures server and client errors. PII is scrubbed at the SDK layer (request bodies, cookies, auth headers, query-string tokens never leave our perimeter).'
  }
];

export const DATA_CATEGORY_LABEL: Record<DataCategory, string> = {
  document_text: 'Audit document text',
  account: 'Account metadata',
  billing: 'Billing data',
  email: 'Email address',
  errors: 'Error events'
};
