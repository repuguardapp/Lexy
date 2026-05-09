-- ============================================================================
-- LexyFlow — Reset + Install (one-shot)
-- ----------------------------------------------------------------------------
-- Drops anything left over from a Supabase Quickstart template that uses the
-- same table names (profiles / audits / subscriptions) but a different
-- schema, then installs the canonical LexyFlow schema (0001 + 0002 + 0003).
--
-- Safe to run on a brand-new project. Idempotent: re-running drops & re-creates.
-- ============================================================================

-- 0. Drop conflicting objects from the Supabase Quickstart template + any
--    previous LexyFlow install. CASCADE removes dependent policies / FKs.
drop table if exists public.audit_translations    cascade;
drop table if exists public.audit_findings        cascade;
drop table if exists public.subscriptions         cascade;
drop table if exists public.audits                cascade;
drop table if exists public.organizations         cascade;
drop table if exists public.rate_limits           cascade;
drop table if exists public.stripe_webhook_events cascade;
drop table if exists public.locale_frameworks     cascade;
drop table if exists public.legal_frameworks      cascade;
drop table if exists public.profiles              cascade;  -- template only
drop type  if exists public.audit_status          cascade;
drop type  if exists public.severity_level        cascade;
drop type  if exists public.subscription_status   cascade;
drop type  if exists public.plan_id               cascade;

-- 1. ===== 0001_init.sql =====
-- ============================================================================
-- LexyFlow — Initial schema
-- ============================================================================
-- Tables:
--   legal_frameworks   reference data (one row per regulation)
--   locale_frameworks  many-to-many between BCP-47 locale and frameworks
--   organizations     tenant root; owns audits + billing
--   audits            head record of an audit run (no document body stored)
--   audit_findings    individual findings produced by Multi-Pass
--   audit_translations cached pass-2 outputs keyed by (audit_id, language)
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Reference data
-- ----------------------------------------------------------------------------
create table if not exists public.legal_frameworks (
  id              text primary key,                       -- 'gdpr', 'lgpd'…
  name            text not null,
  jurisdiction    text not null,                          -- 'EU', 'BR', 'JP'
  authority       text not null,
  citation_style  text not null check (citation_style in ('article','section','chapter')),
  created_at      timestamptz not null default now()
);

create table if not exists public.locale_frameworks (
  locale          text not null,                          -- BCP-47, lowercase
  country         text not null,                          -- ISO-3166-1 alpha-2
  framework_id    text not null references public.legal_frameworks(id) on delete cascade,
  is_default      boolean not null default false,         -- shown first in UI
  primary key (locale, country, framework_id)
);

create index if not exists locale_frameworks_locale_idx
  on public.locale_frameworks (locale);
create index if not exists locale_frameworks_country_idx
  on public.locale_frameworks (country);

-- ----------------------------------------------------------------------------
-- Tenants & audits
-- ----------------------------------------------------------------------------
create table if not exists public.organizations (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  country         text not null,                          -- ISO-3166-1 alpha-2
  ui_locale       text not null default 'en',
  default_report_language text not null default 'en',     -- BCP-47
  stripe_customer_id text unique,
  created_at      timestamptz not null default now()
);

create type public.audit_status as enum ('pending','running','completed','failed');

create table if not exists public.audits (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_hash   text not null,                          -- sha-256 hex
  -- IMPORTANT: zero-knowledge — we never store the source document text.
  -- We store ONLY the hash for idempotency and the AI-authored report below.
  frameworks      text[] not null,
  status          public.audit_status not null default 'pending',
  risk_score      smallint,
  summary         text,
  language        text not null default 'en',             -- pass-1 pivot
  error_message   text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists audits_org_idx     on public.audits (organization_id, created_at desc);
create index if not exists audits_status_idx  on public.audits (status) where status in ('pending','running');
create unique index if not exists audits_dedup_idx
  on public.audits (organization_id, document_hash, language);

create type public.severity_level as enum ('critical','high','medium','low','info');

create table if not exists public.audit_findings (
  id              uuid primary key default uuid_generate_v4(),
  audit_id        uuid not null references public.audits(id) on delete cascade,
  framework_id    text not null references public.legal_frameworks(id),
  citation        text not null,
  severity        public.severity_level not null,
  title           text not null,
  body            text not null,
  recommendation  text not null,
  evidence        text not null,
  created_at      timestamptz not null default now()
);

create index if not exists audit_findings_audit_idx on public.audit_findings (audit_id);

-- Pass-2 cache. Keeps each translation alongside the canonical English audit.
create table if not exists public.audit_translations (
  audit_id        uuid not null references public.audits(id) on delete cascade,
  language        text not null,                          -- BCP-47
  summary         text not null,
  findings        jsonb not null,                         -- [{title,body,recommendation}]
  generated_at    timestamptz not null default now(),
  primary key (audit_id, language)
);

-- ----------------------------------------------------------------------------
-- Row-Level Security
-- ----------------------------------------------------------------------------
alter table public.organizations      enable row level security;
alter table public.audits             enable row level security;
alter table public.audit_findings     enable row level security;
alter table public.audit_translations enable row level security;

-- The service role bypasses RLS; these policies cover end-user read paths
-- once Supabase Auth is wired in. They assume the org id is carried in the
-- `app_metadata.organization_id` JWT claim.
create policy "members read own org" on public.organizations
  for select using (
    id::text = coalesce(auth.jwt()->'app_metadata'->>'organization_id', '')
  );

create policy "members read own audits" on public.audits
  for select using (
    organization_id::text = coalesce(auth.jwt()->'app_metadata'->>'organization_id', '')
  );

create policy "members read own findings" on public.audit_findings
  for select using (
    audit_id in (
      select id from public.audits
      where organization_id::text = coalesce(auth.jwt()->'app_metadata'->>'organization_id', '')
    )
  );

create policy "members read own translations" on public.audit_translations
  for select using (
    audit_id in (
      select id from public.audits
      where organization_id::text = coalesce(auth.jwt()->'app_metadata'->>'organization_id', '')
    )
  );

-- 2. ===== 0002_seed_frameworks.sql =====
-- Seed reference data: legal frameworks and locale → country → framework map.
-- The mapping below is what powers the UI default selection: a Japanese-speaking
-- user from JP gets APPI pre-selected; a French user from FR gets GDPR + AI Act.

insert into public.legal_frameworks (id, name, jurisdiction, authority, citation_style)
values
  ('gdpr',     'General Data Protection Regulation',     'EU',    'European Data Protection Board',                'article'),
  ('eu_ai_act','EU AI Act (Regulation 2024/1689)',       'EU',    'European AI Office',                            'article'),
  ('lgpd',     'Lei Geral de Proteção de Dados',         'BR',    'ANPD',                                          'article'),
  ('appi',     'Act on the Protection of Personal Information', 'JP', 'Personal Information Protection Commission', 'article'),
  ('ccpa',     'California Consumer Privacy Act / CPRA', 'US-CA', 'California Privacy Protection Agency',          'section'),
  ('pipeda',   'Personal Information Protection and Electronic Documents Act', 'CA', 'OPC',                       'section'),
  ('uk_gdpr',  'UK GDPR + Data Protection Act 2018',     'UK',    'Information Commissioner''s Office',            'article')
on conflict (id) do update set
  name = excluded.name,
  jurisdiction = excluded.jurisdiction,
  authority = excluded.authority,
  citation_style = excluded.citation_style;

-- Native locales
insert into public.locale_frameworks (locale, country, framework_id, is_default) values
  ('en','US','ccpa',   true),
  ('en','GB','uk_gdpr',true),
  ('en','IE','gdpr',   true),
  ('en','IE','eu_ai_act',false),
  ('en','CA','pipeda', true),
  ('fr','FR','gdpr',   true),
  ('fr','FR','eu_ai_act',false),
  ('fr','BE','gdpr',   true),
  ('fr','LU','gdpr',   true),
  ('es','ES','gdpr',   true),
  ('es','ES','eu_ai_act',false),
  ('es','MX','gdpr',   false),
  ('de','DE','gdpr',   true),
  ('de','DE','eu_ai_act',false),
  ('de','AT','gdpr',   true),
  ('pt-br','BR','lgpd',true),
  ('ja','JP','appi',   true)
on conflict do nothing;

-- 3. ===== 0003_subscriptions.sql =====
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

-- 4. Anonymous demo organisation — used by the unauthenticated /audit
--    flow on the marketing site. The placeholder UUID is hardcoded in
--    src/app/[locale]/audit/page.tsx as ANONYMOUS_ORG_ID.
insert into public.organizations (id, name, country, ui_locale, default_report_language)
values ('00000000-0000-0000-0000-000000000000', 'Demo (anonymous)', 'FR', 'fr', 'fr')
on conflict (id) do nothing;

-- 5. ===== 0005_grant_service_role.sql =====
-- ============================================================================
-- LexyFlow — service_role grants
-- ----------------------------------------------------------------------------
-- The new Supabase API key v2 (sb_secret_*) authenticates as the
-- `service_role` Postgres role. Depending on how the schema migrations
-- were applied, the default GRANTs for service_role may not have been
-- attached, leading to PG error 42501 (permission denied) on insert.
--
-- This migration is idempotent — safe to re-run.
-- ============================================================================

grant usage on schema public to service_role;

grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- Future objects (e.g. if a later migration creates new tables) inherit
-- the same privileges automatically.
alter default privileges in schema public
  grant all on tables    to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant all on functions to service_role;

-- anon / authenticated are intentionally limited to SELECT — RLS policies
-- defined in 0001_init.sql do the row-level filtering.
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
