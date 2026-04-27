import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createCheckoutSession } from '@/lib/stripe';

export const runtime = 'nodejs';

const Body = z.object({
  plan: z.enum(['starter', 'pro', 'enterprise']),
  locale: z.string().min(2).max(10),
  organizationId: z.string().uuid(),
  customerEmail: z.string().email().optional()
});

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid_request', detail: String(err) }, { status: 400 });
  }

  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
  const session = await createCheckoutSession({ ...parsed, origin });

  return NextResponse.json({ id: session.id, url: session.url });
}
