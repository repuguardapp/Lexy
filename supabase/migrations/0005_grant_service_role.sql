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
