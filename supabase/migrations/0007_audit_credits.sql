-- 0007_audit_credits.sql
--
-- Credits-based paywall for audits. The previous gate (rate limit only)
-- did not distinguish a free trial from a paid customer's allowance, so
-- we add a per-organization credit balance and consume one credit per
-- successful audit.
--
-- Design notes:
--   * Anonymous-org runs (00000000-…) skip the check — that's the
--     marketing-funnel free trial. Their throttle stays the per-IP /
--     per-org rate limit configured in the route handler.
--   * try_consume_audit_credit() is atomic — the WHERE clause guards
--     against TOCTOU races between concurrent submissions on the same
--     org (e.g. a user clicking "Submit" twice in 100ms). RETURNING
--     surfaces the new balance so we can also use this from a future
--     /api/me/credits endpoint.
--   * refund_audit_credit() lets the route handler give the credit
--     back when the Multi-Pass engine throws (timeout, malformed JSON,
--     persistence error). A failed audit shouldn't cost the customer.
--   * Both functions run as SECURITY DEFINER because they need to
--     bypass RLS — the route handler authenticates as service_role
--     anyway, but defining them DEFINER means a future migration to a
--     less-privileged caller path doesn't require revisiting them.

alter table public.organizations
  add column if not exists credits_remaining integer not null default 0;

create or replace function public.try_consume_audit_credit(p_org_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining int;
begin
  -- Anonymous-org bypass: free trial flow on the marketing site.
  if p_org_id = '00000000-0000-0000-0000-000000000000'::uuid then
    return true;
  end if;

  update public.organizations
     set credits_remaining = credits_remaining - 1
   where id = p_org_id
     and credits_remaining > 0
  returning credits_remaining into v_remaining;

  return v_remaining is not null;
end;
$$;

create or replace function public.refund_audit_credit(p_org_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.organizations
     set credits_remaining = credits_remaining + 1
   where id = p_org_id
     and id <> '00000000-0000-0000-0000-000000000000'::uuid;
$$;

-- The service_role already has full table access; we only need to grant
-- EXECUTE on the new functions explicitly because PG's default for
-- functions is REVOKE on creation under the SECURITY DEFINER pattern.
grant execute on function public.try_consume_audit_credit(uuid) to service_role;
grant execute on function public.refund_audit_credit(uuid) to service_role;
