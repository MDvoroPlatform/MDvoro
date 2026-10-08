# Environment variables

Copy `.env.example` for local setup. Do not commit `.env` files. `NEXT_PUBLIC_*` values are compiled into browser assets and must contain public values only.

| Variable | Required | Runtime / exposure | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Build and server/browser; public | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Build and server/browser; public | Supabase publishable client key. Never use a secret/service-role key here. |
| `NEXT_PUBLIC_SITE_URL` | Yes in production | Build/server; public | Canonical URL used by metadata, sitemap and robots. |
| `MDVORO_APP_ORIGIN` | Yes in production | Server; non-secret | Trusted origin for mutation Origin/Referer checks. Must be HTTPS and match the site URL origin. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Yes in production | Build/browser; public | Cloudflare Turnstile site key passed to Supabase Auth signup CAPTCHA validation. Configure the matching secret and CAPTCHA provider in Supabase Auth settings. |
| `MDVORO_ENABLE_AI` | Optional; default off | Server; non-secret | Enables admin AI suggestions only when exactly `true`. |
| `MDVORO_AI_PROVIDER` | Optional | Server; non-secret | `openai`, `anthropic`, `google`, or `manual` provider selector. |
| `MDVORO_AI_MODEL` | Optional | Server; non-secret | Provider model name. |
| `MDVORO_OPENAI_API_KEY` | Optional | Server secret | OpenAI provider credential. |
| `MDVORO_ANTHROPIC_API_KEY` | Optional | Server secret | Anthropic provider credential. |
| `MDVORO_GOOGLE_API_KEY` | Optional | Server secret | Google provider credential. |
| `MDVORO_AI_API_KEY` | Optional | Server secret | Backwards-compatible generic provider credential. Prefer the provider-specific variable. |
| `DMCA_AGENT_NAME` | Optional by code; configure before relevant legal operations | Server; personal/contact data | Copyright agent contact metadata. |
| `DMCA_AGENT_ORGANIZATION` | Optional | Server; operational data | Copyright agent organization. |
| `DMCA_AGENT_EMAIL` | Optional | Server; operational data | Copyright agent email. |
| `DMCA_AGENT_PHONE` | Optional | Server; operational data | Copyright agent phone. |
| `DMCA_AGENT_ADDRESS` | Optional | Server; operational data | Copyright agent mailing address. |
| `SUPABASE_URL` | Admin CLI only | Operator environment; public endpoint | URL used by `npm run provision:admin`. Not read by the web application. |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin CLI only | Operator environment; **secret** | Privileged key used only by the trusted admin provisioning command. Never expose or prefix with `NEXT_PUBLIC_`. |
| `ADMIN_EMAIL` | Admin CLI only | Operator environment; personal data | Existing Auth account to provision as an admin. |
| `LOAD_BASE_URL` | Optional load script | Operator environment | Base URL for `npm run load:test`; defaults to localhost. |
| `LOAD_PATH` | Optional load script | Operator environment | Endpoint to request; defaults to `/api/health/live`. |
| `LOAD_CONCURRENCY` | Optional load script | Operator environment | Number of concurrent requests, capped by the script. |
| `LOAD_ROUNDS` | Optional load script | Operator environment | Request rounds, capped by the script. |
| `LOAD_TIMEOUT_MS` | Optional load script | Operator environment | Per-request timeout, bounded by the script. |

## Production validation

`lib/config/env.ts` requires the Supabase public URL/key, canonical site URL, app origin and Turnstile site key when `NODE_ENV=production`. It rejects invalid URLs, mismatched origins, and non-HTTPS app origins. The corresponding Supabase CAPTCHA secret belongs in Supabase Auth configuration, not this web app's public environment.
