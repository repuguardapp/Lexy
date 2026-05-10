-- 0008_add_audit_credits.sql
--
-- Companion to migration 0007 (try_consume_audit_credit /
-- refund_audit_credit). The Stripe webhook now calls this function on
-- every `invoice.paid` event to top up the org's credit balance by the
-- plan's monthly allotment.
--
-- Idempotency: each webhook delivery is deduped by `stripe_webhook_events`
-- BEFORE this RPC is invoked, so a Stripe retry of the same event_id can
-- never double-credit. The function itself is intentionally not idempotent
-- (it always increments) — the dedup happens one layer up.
--
-- SECURITY DEFINER + EXECUTE-to-service_role mirrors the pattern from
-- 0007 so a future migration to a less-privileged caller path won't
-- silently break.

create or replace function public.add_audit_credits(p_org_id uuid, p_amount int)
returns int
language sql
security definer
set search_path = public
as $$
  update public.organizations
     set credits_remaining = credits_remaining + p_amount
   where id = p_org_id
  returning credits_remaining;
$$;

grant execute on function public.add_audit_credits(uuid, int) to service_role;
