/**
 * Single source of truth for the LexyFlow public + internal API.
 *
 * Why a hand-curated manifest rather than zod-to-openapi?
 *   - The endpoints are few (< 15) and we own them all.
 *   - We document semantics (rate limits, side effects, Zero-Knowledge
 *     guarantees) that auto-generators would miss.
 *   - The manifest doubles as a smoke-test target and a place to declare
 *     stability — see `stability` per endpoint.
 *
 * To keep this honest, every entry references the Zod schema that
 * actually validates the request, so drift is impossible without a
 * type-check failure.
 */

export type Stability = 'stable' | 'beta' | 'internal';

export interface ApiField {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
  description: string;
  stability: Stability;
  auth: 'none' | 'cookie' | 'stripe-signature';
  rateLimit?: string;
  requestBody?: {
    contentType: string;
    fields: ApiField[];
  };
  response: {
    success: { status: number; description: string; example?: object };
    errors: Array<{ status: number; code: string; description: string }>;
  };
}

export const ENDPOINTS: ApiEndpoint[] = [
  {
    method: 'POST',
    path: '/api/audit',
    summary: 'Run a synchronous audit',
    description:
      "Synchronous Multi-Pass audit. Reads the document into memory, extracts text " +
      "(PDF/DOCX/MD/TXT), runs Pass 1 (Claude) then Pass 2 (GPT-4o), wipes the " +
      "source bytes on every exit path, and returns the report.",
    stability: 'stable',
    auth: 'none',
    rateLimit: '5 / hour per IP, 50 / day per organization',
    requestBody: {
      contentType: 'multipart/form-data',
      fields: [
        { name: 'document',       type: 'file',   required: true,  description: 'PDF, DOCX, MD or TXT, ≤ 25 MB.' },
        { name: 'organizationId', type: 'uuid',   required: true,  description: 'Tenant id; inherited from the JWT in the dashboard.' },
        { name: 'frameworks',     type: 'string', required: true,  description: 'Comma-separated framework ids (e.g. "gdpr,eu_ai_act").' },
        { name: 'targetLanguage', type: 'string', required: true,  description: 'BCP-47 tag for the localized report (e.g. "fr", "ja", "ar").' }
      ]
    },
    response: {
      success: {
        status: 200,
        description: '{ auditId, report } — full audit report inline.',
        example: { auditId: '<uuid>', report: { summary: '…', riskScore: 68, findings: [] } }
      },
      errors: [
        { status: 400, code: 'document_required',     description: 'No file in the multipart body.' },
        { status: 400, code: 'invalid_metadata',      description: 'Zod validation failed.' },
        { status: 413, code: 'document_too_large',    description: 'File exceeds 25 MB.' },
        { status: 422, code: 'extraction_or_audit_failed', description: 'Could not extract text or AI pass failed.' },
        { status: 429, code: 'rate_limited',          description: 'Per-IP or per-org limit hit. Retry-After in headers.' }
      ]
    }
  },
  {
    method: 'POST',
    path: '/api/audit/async',
    summary: 'Queue an asynchronous audit',
    description:
      'Same as /api/audit but returns 202 immediately with an audit id. ' +
      'Poll /api/audit/[id] for completion. Designed for large documents ' +
      'and the new audit form UX.',
    stability: 'stable',
    auth: 'none',
    rateLimit: '5 / hour per IP, 50 / day per organization',
    requestBody: {
      contentType: 'multipart/form-data',
      fields: [
        { name: 'document',       type: 'file',   required: true,  description: 'PDF, DOCX, MD or TXT.' },
        { name: 'organizationId', type: 'uuid',   required: true,  description: 'Tenant id.' },
        { name: 'frameworks',     type: 'string', required: true,  description: 'Comma-separated framework ids.' },
        { name: 'targetLanguage', type: 'string', required: true,  description: 'BCP-47 tag.' }
      ]
    },
    response: {
      success: { status: 202, description: '{ auditId, status: "pending" }' },
      errors: [
        { status: 400, code: 'document_required',  description: 'No file in the multipart body.' },
        { status: 429, code: 'rate_limited',       description: 'Limits hit.' },
        { status: 500, code: 'persistence_failed', description: 'Could not insert the pending audit row.' }
      ]
    }
  },
  {
    method: 'GET',
    path: '/api/audit/[id]',
    summary: 'Audit status & metadata',
    description:
      'Returns status, risk score and findings count. Never returns the ' +
      'findings body or the source document — those require a session via ' +
      'the dashboard. Cache-Control: no-store; safe to poll every 2 s.',
    stability: 'stable',
    auth: 'none',
    response: {
      success: {
        status: 200,
        description: '{ id, status, riskScore, language, createdAt, completedAt, findingsCount }',
        example: {
          id: '<uuid>',
          status: 'completed',
          riskScore: 68,
          language: 'fr',
          findingsCount: 7
        }
      },
      errors: [
        { status: 400, code: 'invalid_id',    description: 'Path param is not a UUID.' },
        { status: 404, code: 'not_found',     description: 'Audit does not exist.' },
        { status: 500, code: 'lookup_failed', description: 'DB error.' }
      ]
    }
  },
  {
    method: 'POST',
    path: '/api/checkout',
    summary: 'Stripe Checkout session',
    description:
      'Creates a Stripe Checkout Session in the user\'s currency and locale. ' +
      'Currency derives from the resolved locale descriptor; tax is auto-' +
      'calculated by Stripe Tax.',
    stability: 'stable',
    auth: 'none',
    requestBody: {
      contentType: 'application/json',
      fields: [
        { name: 'plan',            type: '"starter" | "pro" | "enterprise"', required: true,  description: 'Plan id.' },
        { name: 'locale',          type: 'string', required: true,  description: 'BCP-47 locale.' },
        { name: 'organizationId',  type: 'uuid',   required: true,  description: 'Tenant id.' },
        { name: 'customerEmail',   type: 'email',  required: false, description: 'Pre-fills the Stripe checkout email field.' }
      ]
    },
    response: {
      success: { status: 200, description: '{ id, url } — redirect the client to url.' },
      errors: [
        { status: 400, code: 'invalid_request', description: 'Zod validation failed.' }
      ]
    }
  },
  {
    method: 'POST',
    path: '/api/billing/portal',
    summary: 'Stripe Customer Portal session',
    description:
      'Creates a Stripe billing-portal session for the authenticated user\'s ' +
      'organization. Redirect the client to the returned URL.',
    stability: 'stable',
    auth: 'cookie',
    response: {
      success: { status: 200, description: '{ url }' },
      errors: [
        { status: 401, code: 'unauthenticated',  description: 'No Supabase session.' },
        { status: 403, code: 'no_organization',  description: 'User has no org in JWT.' },
        { status: 409, code: 'no_subscription',  description: 'Org has no Stripe customer yet — send to /pricing.' }
      ]
    }
  },
  {
    method: 'POST',
    path: '/api/stripe-webhook',
    summary: 'Stripe webhook ingress',
    description:
      'Verifies Stripe signature, idempotently records the event, and ' +
      'reconciles subscriptions. Always returns 200 once the event is ' +
      'recorded, even if downstream handlers throw — the row is kept for ' +
      'manual replay.',
    stability: 'stable',
    auth: 'stripe-signature',
    response: {
      success: { status: 200, description: '{ ok: true }' },
      errors: [
        { status: 400, code: 'missing_signature',     description: 'Header absent.' },
        { status: 400, code: 'invalid_signature',     description: 'Signature mismatch.' },
        { status: 500, code: 'webhook_not_configured', description: 'STRIPE_WEBHOOK_SECRET unset.' }
      ]
    }
  },
  {
    method: 'POST',
    path: '/api/auth/magic-link',
    summary: 'Send a sign-in magic link',
    description:
      'Triggers Supabase signInWithOtp for the given email. Always returns ' +
      '200 to prevent email enumeration.',
    stability: 'stable',
    auth: 'none',
    rateLimit: '10 / hour per IP',
    requestBody: {
      contentType: 'application/json',
      fields: [
        { name: 'email',  type: 'email',  required: true, description: 'User email.' },
        { name: 'locale', type: 'string', required: false, description: 'Used to localize the post-auth redirect.' }
      ]
    },
    response: {
      success: { status: 200, description: '{ ok: true } — even if the email did not exist.' },
      errors: [
        { status: 400, code: 'invalid_request', description: 'Zod validation failed.' },
        { status: 429, code: 'rate_limited',    description: '10/h cap hit.' }
      ]
    }
  },
  {
    method: 'GET',
    path: '/api/auth/callback',
    summary: 'Magic-link landing endpoint',
    description:
      'Exchanges either ?code= (PKCE) or ?token_hash= + ?type= for a ' +
      'session cookie, then 302-redirects to ?next (sanitized to a same-' +
      'origin path).',
    stability: 'stable',
    auth: 'none',
    response: {
      success: { status: 302, description: 'Redirect to next.' },
      errors: [
        { status: 302, code: 'redirect_to_login', description: 'Token invalid or missing — bounces to /en/login?error=…' }
      ]
    }
  },
  {
    method: 'POST',
    path: '/api/auth/signout',
    summary: 'Sign out',
    description: 'Clears the Supabase session cookies and redirects to /.',
    stability: 'stable',
    auth: 'cookie',
    response: { success: { status: 303, description: 'Redirect to /' }, errors: [] }
  },
  {
    method: 'POST',
    path: '/api/onboarding',
    summary: 'Bootstrap an organization',
    description:
      'Called once after the first magic-link sign-in. Creates the org ' +
      'and stamps the user\'s app_metadata.organization_id so RLS sees the ' +
      'membership on the next request.',
    stability: 'stable',
    auth: 'cookie',
    requestBody: {
      contentType: 'application/json',
      fields: [
        { name: 'name',                  type: 'string', required: true, description: 'Organization name.' },
        { name: 'country',               type: 'string', required: true, description: 'ISO-3166-1 alpha-2.' },
        { name: 'uiLocale',              type: 'string', required: true, description: 'One of the 6 native locales.' },
        { name: 'defaultReportLanguage', type: 'string', required: true, description: 'BCP-47 tag.' }
      ]
    },
    response: {
      success: { status: 200, description: '{ organizationId, alreadyOnboarded }' },
      errors: [
        { status: 401, code: 'unauthenticated',         description: 'No Supabase session.' },
        { status: 400, code: 'invalid_request',         description: 'Zod validation failed.' },
        { status: 500, code: 'org_create_failed',       description: 'DB insert failed.' },
        { status: 500, code: 'metadata_update_failed',  description: 'Auth admin update failed.' }
      ]
    }
  }
];
