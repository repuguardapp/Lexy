-- 0006_public_read_anonymous_audits.sql
--
-- Audits launched without a logged-in account are stamped with the
-- anonymous-org placeholder (00000000-0000-0000-0000-000000000000) by
-- /audit and the embed widget. The product promise for those runs is
-- "share-by-UUID": whoever holds the audit id can open the report,
-- exactly like a Dropbox share link. The id is unguessable, the
-- document text is wiped post-extraction (Zero-Knowledge), and the
-- nightly purge cron clears the row after 30 days.
--
-- Without these policies the dashboard route hits RLS and returns 404
-- because the existing "members read own audits" policy requires a
-- JWT carrying organization_id. The two policies below add an
-- alternative grant: any role (including unauthenticated `anon`) can
-- read rows whose organization_id is the anonymous placeholder.
-- Authenticated, paying customers continue to fall under the existing
-- per-org policy and see only their own work.

create policy "public read anonymous audits"
  on public.audits
  for select
  using (
    organization_id = '00000000-0000-0000-0000-000000000000'::uuid
  );

create policy "public read anonymous audit findings"
  on public.audit_findings
  for select
  using (
    audit_id in (
      select id
      from public.audits
      where organization_id = '00000000-0000-0000-0000-000000000000'::uuid
    )
  );
