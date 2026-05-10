import { NextResponse } from 'next/server';

/**
 * Deprecated. The async + polling architecture has been retired in
 * favour of the synchronous /api/audit endpoint. We keep this route
 * mounted only to return a structured 410 Gone for any client that
 * still has the old URL cached (browser bundles, third-party
 * integrators) — that way the frontend gets a clear error and can
 * surface a precise message instead of timing out or polling a 404.
 *
 * Kept as a route so the file shows up in the deployment manifest;
 * removing it would silently 404 and look like a regression.
 */
export const runtime = 'nodejs';

const GONE_BODY = {
  error: 'endpoint_deprecated',
  detail: 'Use POST /api/audit (synchronous). The async + polling pipeline is retired.',
  redirect: '/api/audit'
};

export async function POST() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}

export async function GET() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}
