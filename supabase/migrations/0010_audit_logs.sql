-- 0010_audit_logs.sql
-- ------------------------------------------------------------------
-- Trust Center — Tier 1.
--
-- Two append-only tables that make our compliance posture visible to
-- the customer:
--
--   data_access_log: every read of plaintext data (audit creation,
--     document decryption, deletion). Surfaced in the Settings →
--     Activité de sécurité page so the customer sees exactly when
--     and from where their data is touched — including by LexyFlow
--     staff if we ever access it for support.
--
--   deletion_log: tamper-evident proof that a deletion was issued.
--     Stores SHA-256(audit_id) + signed receipt rather than the raw
--     id, so the log is useful for compliance audits without itself
--     being a re-identification vector. The customer downloads a
--     receipt at the moment of deletion that can later be presented
--     to regulators ("we asked for this data to be deleted on X,
--     here's the cryptographic proof signed by LexyFlow").
-- ------------------------------------------------------------------

create table if not exists public.data_access_log (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid,                                       -- nullable: anonymous audits have no user
  audit_id        uuid,                                       -- nullable: not every action targets a single audit
  action          text not null check (action in (
                    'audit_created',
                    'document_decrypted',
                    'audit_deleted'
                  )),
  ip              text,                                       -- best-effort, may be null behind certain proxies
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index if not exists data_access_log_org_time_idx
  on public.data_access_log (organization_id, created_at desc);
create index if not exists data_access_log_audit_idx
  on public.data_access_log (audit_id) where audit_id is not null;

alter table public.data_access_log enable row level security;

-- Members of an org can read their own org's access log. Writes are
-- service-role only (the api routes call us with the service key).
create policy "members read own access log" on public.data_access_log
  for select using (
    organization_id::text = coalesce(auth.jwt()->'app_metadata'->>'organization_id', '')
  );

-- ------------------------------------------------------------------

create table if not exists public.deletion_log (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  audit_id_hash   text not null,                              -- sha-256 hex of the deleted audit's uuid
  deleted_at      timestamptz not null default now(),
  deleted_by      uuid,                                       -- user_id (nullable for system-initiated purges)
  ip              text,
  -- HMAC-SHA256 of `${audit_id_hash}|${deleted_at_iso}` signed with
  -- the DOCUMENT_ENCRYPTION_KEY. We embed the same signature in the
  -- receipt we hand to the customer, so they can present it later as
  -- proof we issued the deletion. The signature is verifiable by us
  -- (only we hold the key) — anyone else can only check structural
  -- integrity, not provenance.
  receipt_signature text not null
);

create index if not exists deletion_log_org_time_idx
  on public.deletion_log (organization_id, deleted_at desc);
create index if not exists deletion_log_hash_idx
  on public.deletion_log (audit_id_hash);

alter table public.deletion_log enable row level security;

create policy "members read own deletion log" on public.deletion_log
  for select using (
    organization_id::text = coalesce(auth.jwt()->'app_metadata'->>'organization_id', '')
  );
