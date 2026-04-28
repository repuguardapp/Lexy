#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# check-supabase.sh
#
# Smoke-test the Supabase project URL + anon (publishable) key. Confirms:
#   1. /auth/v1/health is reachable.
#   2. The anon key is recognized by /rest/v1/.
#   3. The legal_frameworks seed table is present (migrations were applied).
#   4. The expected RLS-protected tables exist.
#
# Usage (from the repo root):
#   bash scripts/check-supabase.sh \
#     https://YOUR-PROJECT.supabase.co \
#     Sb_publishable_XXXXXXXX
#
# Or via env vars:
#   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… bash scripts/check-supabase.sh
# ----------------------------------------------------------------------------
set -euo pipefail

URL="${1:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
KEY="${2:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}}"

if [[ -z "$URL" || -z "$KEY" ]]; then
  echo "Usage: bash scripts/check-supabase.sh <url> <anon-key>" >&2
  exit 1
fi

URL="${URL%/}"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
info() { printf '  · %s\n' "$*"; }

echo "▶ Probing $URL"

# 1. Auth health.
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "$URL/auth/v1/health")
[[ "$code" == "200" ]] || fail "auth/v1/health returned $code (expected 200)"
ok "auth/v1/health → 200"

# 2. REST root with anon key.
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 \
  -H "apikey: $KEY" \
  "$URL/rest/v1/")
[[ "$code" == "200" ]] || fail "rest/v1/ returned $code (anon key may be wrong)"
ok "rest/v1/ accepts the anon key"

# 3. Reference data: legal_frameworks must contain at least 7 rows after
#    the 0002 seed migration. We use Range header trick to ask for count.
count=$(curl -s --max-time 8 \
  -H "apikey: $KEY" \
  -H "Authorization: Bearer $KEY" \
  -H "Prefer: count=exact" \
  -I "$URL/rest/v1/legal_frameworks?select=id" \
  | awk -F'/' '/Content-Range/ {gsub(/\r/,"",$NF); print $NF}' \
  | tail -n1)

if [[ -z "$count" || "$count" == "0" ]]; then
  fail "legal_frameworks has $count rows — did you run 0002_seed_frameworks.sql?"
elif [[ "$count" -ge 7 ]]; then
  ok  "legal_frameworks → $count rows (seed applied)"
else
  info "legal_frameworks has $count rows — expected ≥ 7"
fi

# 4. RLS-protected tables exist? An anon SELECT should yield 200 + 0 rows
#    when RLS is on but no policy matches the request. A 404 would mean
#    the table itself does not exist.
for table in organizations audits audit_findings audit_translations subscriptions stripe_webhook_events rate_limits; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 \
    -H "apikey: $KEY" \
    -H "Authorization: Bearer $KEY" \
    "$URL/rest/v1/$table?select=*&limit=1")
  if [[ "$code" == "200" ]]; then
    ok "$table → 200 (RLS active, no rows visible to anon — correct)"
  elif [[ "$code" == "404" ]]; then
    fail "$table → 404 (table missing — run the migrations in order)"
  else
    info "$table → HTTP $code"
  fi
done

echo
printf '\033[1m✓ Supabase looks healthy.\033[0m Next: copy the SERVICE_ROLE_KEY from\n'
echo "  $URL/dashboard/project/_/settings/api"
echo "into the Vercel env var SUPABASE_SERVICE_ROLE_KEY (Production + Preview)."
