import { ENDPOINTS, type ApiEndpoint, type ApiField } from './api-manifest';

/**
 * Translate the typed API manifest into an OpenAPI 3.1 document.
 *
 * Why we hand-roll the conversion instead of using zod-to-openapi:
 *   - the manifest already encodes the things OpenAPI cares about;
 *   - generated specs end up too verbose to publish to customers;
 *   - we keep total control over the security schemes, server entries
 *     and tags.
 */

export interface OpenApiOptions {
  baseUrl: string;
}

export function buildOpenApiSpec({ baseUrl }: OpenApiOptions): object {
  const paths: Record<string, Record<string, object>> = {};

  for (const endpoint of ENDPOINTS) {
    const path = endpoint.path.replace(/\[(\w+)\]/g, '{$1}'); // [id] → {id}
    const method = endpoint.method.toLowerCase();
    paths[path] = paths[path] ?? {};
    paths[path][method] = buildOperation(endpoint);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'LexyFlow API',
      version: '0.1.0',
      description:
        'LexyFlow is the AI assistant for instant global compliance. ' +
        'This OpenAPI document is the canonical machine-readable shape of ' +
        'every endpoint listed at https://lexyflow.com/{locale}/docs/api.',
      termsOfService: `${baseUrl}/en/terms`,
      contact: { name: 'LexyFlow Support', email: 'support@lexyflow.com', url: baseUrl },
      license: { name: 'Proprietary', url: `${baseUrl}/en/terms` }
    },
    servers: [
      { url: baseUrl, description: 'Production' }
    ],
    tags: [
      { name: 'Audit',         description: 'Run and inspect compliance audits.' },
      { name: 'Authentication', description: 'Magic-link sign-in flow.' },
      { name: 'Billing',       description: 'Stripe checkout and customer portal.' },
      { name: 'Webhooks',      description: 'Inbound webhooks from Stripe and Supabase.' },
      { name: 'Onboarding',    description: 'First-time organisation bootstrap.' }
    ],
    paths,
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'sb-access-token',
          description: 'Supabase session cookie set by /api/auth/callback.'
        },
        stripeSignature: {
          type: 'apiKey',
          in: 'header',
          name: 'stripe-signature',
          description: 'HMAC signature provided by Stripe; verified with STRIPE_WEBHOOK_SECRET.'
        }
      }
    }
  };
}

function buildOperation(endpoint: ApiEndpoint): object {
  const tag = tagFor(endpoint);
  const operation: Record<string, unknown> = {
    summary: endpoint.summary,
    description:
      endpoint.description +
      (endpoint.rateLimit ? `\n\nRate limit: ${endpoint.rateLimit}.` : '') +
      (endpoint.stability !== 'stable' ? `\n\nStability: **${endpoint.stability}**.` : ''),
    tags: [tag],
    operationId: operationIdFor(endpoint),
    responses: buildResponses(endpoint)
  };

  if (endpoint.auth === 'cookie') {
    operation.security = [{ sessionCookie: [] }];
  } else if (endpoint.auth === 'stripe-signature') {
    operation.security = [{ stripeSignature: [] }];
  } else {
    operation.security = [];
  }

  if (endpoint.requestBody) {
    operation.requestBody = {
      required: endpoint.requestBody.fields.some((f) => f.required),
      content: {
        [endpoint.requestBody.contentType]: {
          schema: schemaForFields(endpoint.requestBody.fields)
        }
      }
    };
  }

  return operation;
}

function operationIdFor(endpoint: ApiEndpoint): string {
  const slug = endpoint.path
    .replace(/^\//, '')
    .replace(/\[(\w+)\]/g, 'by_$1')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_|_$/g, '');
  return `${endpoint.method.toLowerCase()}_${slug}`;
}

function tagFor(endpoint: ApiEndpoint): string {
  if (endpoint.path.startsWith('/api/audit'))           return 'Audit';
  if (endpoint.path.startsWith('/api/auth'))            return 'Authentication';
  if (endpoint.path.startsWith('/api/billing'))         return 'Billing';
  if (endpoint.path.startsWith('/api/checkout'))        return 'Billing';
  if (endpoint.path.startsWith('/api/stripe-webhook')) return 'Webhooks';
  if (endpoint.path.startsWith('/api/onboarding'))      return 'Onboarding';
  return 'Other';
}

function schemaForFields(fields: readonly ApiField[]): object {
  const properties: Record<string, object> = {};
  const required: string[] = [];

  for (const f of fields) {
    properties[f.name] = mapFieldToSchema(f);
    if (f.required) required.push(f.name);
  }

  const schema: Record<string, unknown> = { type: 'object', properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

function mapFieldToSchema(f: ApiField): object {
  const t = f.type;

  // Union types written as `"a" | "b"` map to enum.
  const literalUnion = t.match(/^"[^"]+"(?:\s*\|\s*"[^"]+")+$/);
  if (literalUnion) {
    return {
      type: 'string',
      enum: t.split('|').map((s) => s.trim().replace(/^"|"$/g, '')),
      description: f.description
    };
  }

  if (t === 'uuid')   return { type: 'string', format: 'uuid',   description: f.description };
  if (t === 'email')  return { type: 'string', format: 'email',  description: f.description };
  if (t === 'file')   return { type: 'string', format: 'binary', description: f.description };
  if (t === 'string') return { type: 'string', description: f.description };
  if (t === 'number' || t === 'integer') return { type: t, description: f.description };
  if (t === 'boolean') return { type: 'boolean', description: f.description };

  // Default: string with the literal type kept as a hint.
  return { type: 'string', description: `${f.description} (type: ${t})` };
}

function buildResponses(endpoint: ApiEndpoint): object {
  const responses: Record<string, object> = {};
  responses[String(endpoint.response.success.status)] = {
    description: endpoint.response.success.description,
    ...(endpoint.response.success.example
      ? {
          content: {
            'application/json': {
              example: endpoint.response.success.example
            }
          }
        }
      : {})
  };
  for (const err of endpoint.response.errors) {
    responses[String(err.status)] = {
      description: `${err.code} — ${err.description}`
    };
  }
  return responses;
}
