import Stripe from 'stripe';
import { getLocaleDescriptor } from '@/i18n/locales';

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error('STRIPE_SECRET_KEY is not configured');
    client = new Stripe(secret, { apiVersion: '2024-06-20', typescript: true });
  }
  return client;
}

export type PlanId = 'starter' | 'pro' | 'enterprise';

const PRICE_ENV: Record<PlanId, string> = {
  starter:    'STRIPE_PRICE_STARTER',
  pro:        'STRIPE_PRICE_PRO',
  enterprise: 'STRIPE_PRICE_ENTERPRISE'
};

export function priceIdFor(plan: PlanId): string {
  const envKey = PRICE_ENV[plan];
  const id = process.env[envKey];
  if (!id) throw new Error(`Missing env ${envKey} for plan ${plan}`);
  return id;
}

export interface CheckoutOptions {
  plan: PlanId;
  locale: string;
  customerEmail?: string;
  organizationId: string;
  /** Origin used to build success/cancel URLs. */
  origin: string;
}

/**
 * Create a Checkout Session whose UI language and currency follow the
 * user's resolved locale.
 *
 * Currency notes:
 *   • The Stripe Price object must already exist in each currency we want
 *     to charge in (Stripe does not auto-convert at runtime). The
 *     `currency_options` on the Price let us send a single Price ID and have
 *     Stripe pick the matching currency from `currency`.
 *   • `automatic_tax` triggers Stripe Tax which calculates VAT/GST/etc.
 *     based on the customer's billing country — covering the "calcul auto
 *     des taxes mondiales" requirement.
 */
export async function createCheckoutSession(opts: CheckoutOptions) {
  const descriptor = getLocaleDescriptor(opts.locale);
  const stripeLocale = descriptor.stripeLocale as Stripe.Checkout.SessionCreateParams.Locale;

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    locale: stripeLocale,
    currency: descriptor.currency.toLowerCase(),
    line_items: [{ price: priceIdFor(opts.plan), quantity: 1 }],
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    customer_email: opts.customerEmail,
    client_reference_id: opts.organizationId,
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    success_url: `${opts.origin}/${opts.locale}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${opts.origin}/${opts.locale}/pricing`,
    subscription_data: {
      metadata: {
        organization_id: opts.organizationId,
        ui_locale: opts.locale
      }
    }
  });

  return session;
}
