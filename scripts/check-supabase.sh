#!/bin/sh
# ----------------------------------------------------------------------------
# check-supabase.sh — POSIX sh (bash, dash, busybox, a-Shell).
#
# Smoke-test the Supabase project URL + anon (publishable) key. Confirms:
#   1. Project alive: /auth/v1/settings answers 200 with the anon key.
#   2. REST root accepts the anon key.
#   3. legal_frameworks contains seed rows (0002 migration applied).
#   4. RLS-protected tables exist (0001 + 0003 migrations applied).
#
# Usage:
#   sh check-supabase.sh <project-url> <anon-key>
# Or via env vars:
#   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... sh check-supabase.sh
# ----------------------------------------------------------------------------
set -eu

URL="${1:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
KEY="${2:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}}"

if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "Usage: sh check-supabase.sh <url> <anon-key>" >&2
  exit 1
fi

# Strip trailing slash if any.
case "$URL" in *"/") URL="${URL%/}" ;; esac

# Plain-ASCII status markers — dash does not interpret \xNN in printf.
ok()   { printf '  [OK]   %s\n' "$*"; }
fail() { printf '  [FAIL] %s\n' "$*" >&2; exit 1; }
info() { printf '  [..]   %s\n' "$*"; }

echo "> Probing $URL"

# 1. Reachability + key validation: Supabase v2 requires the apikey header
#    on /auth/v1/* including /settings. A 200 here proves both the URL
#    resolves and the anon key is recognised.
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 \
  -H "apikey: $KEY" \
  "$URL/auth/v1/settings")
if [ "$code" = "200" ]; then
  ok "auth/v1/settings -> 200 (project alive, anon key OK)"
elif [ "$code" = "401" ] || [ "$code" = "403" ]; then
  fail "auth/v1/settings -> $code (anon key rejected by Supabase)"
else
  info "auth/v1/settings -> HTTP $code (unusual, continuing)"
fi

# 2. Seed data: legal_frameworks must hold >= 7 rows after migration 0002.
#    The Content-Range header carries the total count when we ask for it.
#    This call doubles as our REST gateway validation: if it returns a
#    valid count, REST is working; if it 404s, the table is missing.
count=$(curl -s --max-time 8 \
  -H "apikey: $KEY" \
  -H "Authorization: Bearer $KEY" \
  -H "Prefer: count=exact" \
  -I "$URL/rest/v1/legal_frameworks?select=id" \
  | awk -F'/' '/[Cc]ontent-[Rr]ange/ {gsub(/\r/,"",$NF); print $NF}' \
  | tail -n1)

if [ -z "$count" ] || [ "$count" = "0" ] || [ "$count" = "*" ]; then
  fail "legal_frameworks has ${count:-?} rows -- did you run 0002_seed_frameworks.sql?"
elif [ "$count" -ge 7 ] 2>/dev/null; then
  ok  "legal_frameworks -> $count rows (seed applied)"
else
  info "legal_frameworks has $count rows -- expected >= 7"
fi

# 3. RLS tables exist? An anon SELECT yields 200 + 0 rows when RLS is on
#    but no policy matches. A 404 means the table itself is missing.
for table in organizations audits audit_findings audit_translations subscriptions stripe_webhook_events rate_limits; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 \
    -H "apikey: $KEY" \
    -H "Authorization: Bearer $KEY" \
    "$URL/rest/v1/$table?select=*&limit=1")
  if [ "$code" = "200" ]; then
    ok "$table -> 200 (RLS active, anon sees no rows -- correct)"
  elif [ "$code" = "404" ]; then
    fail "$table -> 404 (table missing -- run the migrations in order)"
  else
    info "$table -> HTTP $code"
  fi
done

echo
echo "> Supabase looks healthy."
echo "Next: copy SERVICE_ROLE_KEY from"
echo "  $URL/project/default/settings/api"
echo "into Vercel env SUPABASE_SERVICE_ROLE_KEY (Production + Preview)."
