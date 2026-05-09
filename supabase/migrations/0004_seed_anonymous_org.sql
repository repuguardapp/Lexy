-- ============================================================================
-- LexyFlow — Anonymous demo organisation
-- ----------------------------------------------------------------------------
-- The marketing /audit page lets visitors run an audit without signing in.
-- The form posts with a fixed organisation_id placeholder
-- (00000000-0000-0000-0000-000000000000) — see ANONYMOUS_ORG_ID in
-- src/app/[locale]/audit/page.tsx.
--
-- Without a matching row here, the FK constraint on audits.organization_id
-- rejects the insert and the audit fails AFTER the AI passes — wasting
-- the AI credit. Inserting this placeholder up-front keeps the demo flow
-- working end to end while remaining isolated by RLS from real tenants.
-- ============================================================================
insert into public.organizations (id, name, country, ui_locale, default_report_language)
values ('00000000-0000-0000-0000-000000000000', 'Demo (anonymous)', 'FR', 'fr', 'fr')
on conflict (id) do nothing;
