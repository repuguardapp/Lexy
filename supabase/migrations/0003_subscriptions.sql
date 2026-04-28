-- ============================================================================
-- LexyFlow — Subscriptions, billing events, processed webhooks
-- ============================================================================

create type public.subscription_status as enum (
  'trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused'
);

create type public.plan_id as enum ('starter','pro','enterprise');

create table if not exists public.subscriptions (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  stripe_subscription_id  text not null unique,
  stripe_customer_id      text not null,
  plan              public.plan_id not null,
  status            public.subscription_status not null,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at         timestamptz,
  canceled_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists subscriptions_org_idx on public.subscriptions (organization_id);
create index if not exists subscriptions_stripe_customer_idx on public.subscriptions (stripe_customer_id);

-- Idempotency for Stripe webhook deliveries.
create table if not exists public.stripe_webhook_events (
  id                text primary key,           -- Stripe event id (evt_…)
  type              text not null,              -- e.g. invoice.paid
  payload           jsonb not null,
  processed_at      timestamptz not null default now()
);

-- Per-org rate-limit counters, persisted across instances. The runtime
-- token bucket (src/lib/rate-limit.ts) hits this table when running outside
-- a single warm container.
create table if not exists public.rate_limits (
  bucket            text not null,              -- "audit:org:<uuid>" or "audit:ip:<ip>"
  window_start      timestamptz not null,
  count             integer not null default 0,
  primary key (bucket, window_start)
);

create index if not exists rate_limits_window_idx
  on public.rate_limits (window_start);

-- RLS
alter table public.subscriptions enable row level security;

create policy "members read own subscriptions" on public.subscriptions
  for select using (
    organization_id::text = coalesce(auth.jwt()->'app_metadata'->>'organization_id', '')
  );

-- The webhook events table is service-role only.
alter table public.stripe_webhook_events enable row level security;
alter table public.rate_limits           enable row level security;
