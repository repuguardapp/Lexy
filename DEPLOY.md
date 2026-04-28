# Deploy LexyFlow to lexyflow.com

End-to-end runbook to bring `repuguardapp/Lexy:main` live on the
`lexyflow.com` domain. Estimated total time: 30 minutes.

---

## 0. Prerequisites

- GitHub: owner of `repuguardapp/Lexy`
- Vercel account (Hobby is fine to start)
- Supabase account
- Stripe account (Stripe Tax enabled)
- Anthropic API key (Claude 3.5 Sonnet access)
- OpenAI API key (GPT-4o access)
- Domain registrar account holding `lexyflow.com`

---

## 1. Auto-sync `repuguard:lexy/genesis` → `Lexy:main`  *(one-time, 2 min)*

Without this step every iteration on the LexyFlow code stays trapped in the
repuguard repo. With it, every `lexy/genesis` push flows automatically into
`repuguardapp/Lexy:main`, which is what Vercel watches.

1. **Generate a fine-grained PAT**:
   `github.com/settings/personal-access-tokens/new`
   - Resource owner: `repuguardapp`
   - Repository access: **Only select repositories** → `repuguardapp/Lexy`
   - Permissions → Repository → **Contents: Read and write**
   - Expiration: 90 days (renew when expired)
2. **Add it as a secret** in `repuguardapp/repuguard`:
   `Settings → Secrets and variables → Actions → New repository secret`
   - Name: `LEXY_PUSH_TOKEN`
   - Value: paste the PAT
3. Trigger the workflow once: `Actions → Sync lexy/genesis → Lexy:main → Run workflow`.

From this point onward every commit on `repuguard:lexy/genesis` propagates
to `repuguardapp/Lexy:main` within ~30 seconds.

---

## 2. Supabase project  *(5 min)*

1. `supabase.com/dashboard/projects` → **New project**
   - Name: `lexyflow`
   - Region: closest to your users (EU = `eu-west-3`)
   - Database password: generate, store in 1Password
2. Once the project is provisioned, copy from **Project Settings → API**:
   - `Project URL`               → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key            → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key    → `SUPABASE_SERVICE_ROLE_KEY`  *(never to client)*
3. Run the migrations (in **SQL Editor**, paste in order):
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_seed_frameworks.sql`

---

## 3. Stripe Billing  *(8 min)*

1. **Activate Stripe Tax**: Dashboard → Tax → Activate (registers VAT/GST).
2. Create three Products with **multi-currency Prices** each:

   | Product    | USD | EUR | BRL  | JPY    | GBP |
   |------------|-----|-----|------|--------|-----|
   | Starter    | 49  | 45  | 249  | 7 300  | 39  |
   | Pro        | 199 | 185 | 990  | 29 500 | 159 |
   | Enterprise | 599 | 549 | 2 990| 89 000 | 479 |

   Use **Price → Add another currency** to attach all five currencies to one Price.
3. Copy each Price ID → environment variables:
   - `STRIPE_PRICE_STARTER`
   - `STRIPE_PRICE_PRO`
   - `STRIPE_PRICE_ENTERPRISE`
4. Webhook endpoint (created **after** Vercel is live): point at
   `https://lexyflow.com/api/stripe-webhook` once that route is implemented
   (currently scaffolded, not enabled).

---

## 4. Vercel project  *(5 min)*

1. `vercel.com/new` → **Import Git Repository** → select `repuguardapp/Lexy`.
2. Vercel auto-detects Next.js. Leave defaults.
3. **Environment Variables** — paste these for `Production` (and `Preview` if you want preview deploys):

   | Variable | Source |
   |----------|--------|
   | `NEXT_PUBLIC_APP_URL` | `https://lexyflow.com` |
   | `NEXT_PUBLIC_APP_NAME` | `LexyFlow` |
   | `NEXT_PUBLIC_SUPABASE_URL` | step 2.2 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | step 2.2 |
   | `SUPABASE_SERVICE_ROLE_KEY` | step 2.2 |
   | `ANTHROPIC_API_KEY` | console.anthropic.com |
   | `ANTHROPIC_MODEL` | `claude-3-5-sonnet-latest` |
   | `OPENAI_API_KEY` | platform.openai.com |
   | `OPENAI_MODEL` | `gpt-4o` |
   | `STRIPE_SECRET_KEY` | dashboard.stripe.com (Live mode) |
   | `STRIPE_WEBHOOK_SECRET` | step 3.4 (later) |
   | `STRIPE_PRICE_STARTER` | step 3.3 |
   | `STRIPE_PRICE_PRO` | step 3.3 |
   | `STRIPE_PRICE_ENTERPRISE` | step 3.3 |

4. **Deploy**. Wait ~2 min.
5. Vercel gives you a `lexy-XXXXX.vercel.app` URL. Verify the homepage loads.

---

## 5. Domain  *(5 min DNS, propagation up to 24 h but usually < 10 min)*

1. Vercel → project → **Settings → Domains** → **Add** `lexyflow.com`.
2. Vercel shows two records to add at your registrar:

   | Type | Host | Value |
   |------|------|-------|
   | `A`     | `@`   | `76.76.21.21` |
   | `CNAME` | `www` | `cname.vercel-dns.com` |

3. At Namecheap (or wherever the domain lives) → **Advanced DNS**, add the
   two records above, remove conflicting ones.
4. Wait until Vercel shows the green check next to the domain.
5. Vercel auto-issues a Let's Encrypt SSL certificate.

---

## 6. Smoke test

```
curl -I https://lexyflow.com/
# Expect: 308 Permanent Redirect → /en (locale detection)

curl -I https://lexyflow.com/en
# Expect: 200 OK, Content-Language: en

curl https://lexyflow.com/sitemap.xml | head -3
# Expect: <urlset> with 6 locales × 4 routes

curl -X POST https://lexyflow.com/api/checkout \
  -H "content-type: application/json" \
  -d '{"plan":"starter","locale":"en","organizationId":"00000000-0000-0000-0000-000000000000"}'
# Expect: { id, url } pointing at checkout.stripe.com
```

---

## 7. Post-launch

- Set up uptime monitoring (e.g. BetterUptime, free tier) on `https://lexyflow.com`.
- Enable Vercel Analytics in the project settings.
- Add `lexyflow.com` to Google Search Console (the multilingual sitemap is at `/sitemap.xml`).
- Schedule the PAT renewal (90 days from issue date).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| 500 on any page | Missing env var | Vercel → Logs → search `is not configured` |
| 401 on `/api/checkout` | Wrong `STRIPE_SECRET_KEY` mode (test vs live) | Match Vercel env to the Stripe mode you want |
| Stripe Checkout opens in English regardless of locale | `stripeLocale` not mapped — check `src/i18n/locales.ts` |
| Sync workflow fails with 403 | PAT lacks `Contents: read & write` on `Lexy` | Regenerate PAT with correct scope, update secret |
| Audit returns 500 with `Anthropic returned no text` | API key invalid or rate-limited | Check Anthropic dashboard usage |
