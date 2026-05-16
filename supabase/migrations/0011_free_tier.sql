-- 0011_free_tier.sql
-- ------------------------------------------------------------------
-- Freemium paywall — one free audit per signed-up organization.
--
-- `free_audit_used` flips to true the first time a free-tier org
-- successfully completes an audit. Subsequent attempts return 402.
-- The flag is org-scoped (not user-scoped) because billing happens
-- at the org level: a team of 5 sharing one org gets ONE freebie.
-- ------------------------------------------------------------------

alter table public.organizations
  add column if not exists free_audit_used boolean not null default false;
