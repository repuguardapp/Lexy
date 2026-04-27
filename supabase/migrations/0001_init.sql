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
