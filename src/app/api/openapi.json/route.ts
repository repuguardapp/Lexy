import { NextResponse } from 'next/server';
import { buildOpenApiSpec } from '@/lib/openapi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Serves the canonical OpenAPI 3.1 document for the LexyFlow API.
 *
 * Generation is sub-millisecond — we don't bother caching. CORS is open
 * because we want third-party tools (Postman, Insomnia, OpenAPI viewers)
 * to fetch this directly from the browser.
 */
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lexyflow.com';
  const spec = buildOpenApiSpec({ baseUrl });

  return NextResponse.json(spec, {
    headers: {
      'Cache-Control': 'public, max-age=300, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type'
    }
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type'
    }
  });
}
