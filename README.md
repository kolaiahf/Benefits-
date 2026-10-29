# Harbor Agency

Open-source general agency for small-group **medical, dental, and vision** quoting. The HTTP API is the product. The browser is a console on top of it.

The visible name, mark, logo, and colors come from [`src/brand.ts`](src/brand.ts). Harbor is the neutral placeholder. Set `BRAND_PRODUCT_NAME`, `BRAND_AGENCY_NAME`, `BRAND_LOGO_URL`, and `BRAND_COLOR_*` to replace it. The project is GPL-3.0-only. See [LICENSE](LICENSE).

## What it does

- Upload a census CSV, or replace it from payroll.
- Rate every covered person on the federal default age curve. At most the three oldest children under 21 are billed in a family.
- Price dental and vision on four tiers: employee, employee and spouse, employee and children, family.
- Compare plans and recommend a portfolio from employee cost, employer budget, and plan richness.
- Connect an employer’s HR or payroll system with [Finch](https://tryfinch.com) and read directory, employment, and current benefit elections.
- Issue API keys for other systems. Quote creation accepts an `Idempotency-Key`.

Sample rate tables ship with the server so a broker can run a quote immediately. They are marked `illustrative_sample`. Load your own base rates and ZIP factors before a quote is presented as bindable. Gender is stored and is not a rating factor. Salary is shown from payroll and is not used to price medical.

## Run it

Node 22 or newer.

```bash
cp .env.example .env
npm ci
npm run dev
```

Open http://localhost:3000. With no Supabase keys, local password sign-in is `broker@example.com` / `demo1234`. That route is off in production.

API docs: http://localhost:3000/docs

OpenAPI: http://localhost:3000/v1/openapi.json

To run the API process by itself (port 8787) and the older Vite console (port 5173):

```bash
npm run dev:api
npm run dev:web
```

```bash
docker build -t agency .
docker run --rm -p 3000:3000 \
  -e APP_SECRET="$(openssl rand -base64 32)" \
  -e DATABASE_URL="postgresql://postgres.pdqxwncosrrlzhqlvofd:[PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres" \
  -e NEXT_PUBLIC_SUPABASE_URL="https://pdqxwncosrrlzhqlvofd.supabase.co" \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY="[ANON_KEY]" \
  agency
```

The image serves the console and the API on port 3000. Supabase keys are read at runtime.

## Quote from the API

```bash
TOKEN=$(curl -s -X POST localhost:3000/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"broker@example.com","password":"demo1234"}' | jq -r .token)

GROUP=$(curl -s -X POST localhost:3000/v1/groups \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"legal_name":"Northwind Studio","state":"CA","zip":"92101","effective_date":"2026-07-01"}' \
  | jq -r .group.id)

curl -s -X PUT "localhost:3000/v1/groups/$GROUP/census" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: text/csv' \
  --data-binary @examples/northwind-census.csv

curl -s -X POST "localhost:3000/v1/groups/$GROUP/quotes" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -H 'idempotency-key: northwind-1' \
  -d '{"contribution":{"mode":"percent_of_premium","employer_percent":75},"preferences":{"prioritize":"balanced"}}'
```

Create a long-lived key with `POST /v1/api-keys`. Send it as `Authorization: Bearer ag_live_...`.

Census columns: `subscriber_id`, `relationship` (`self`, `spouse`, `child`), `first_name`, `last_name`, `date_of_birth`, `zip`. Optional: `gender`, `tobacco`, `annual_salary`, `email`, `waived`.

Contribution modes:

| Mode | Meaning |
| --- | --- |
| `percent_of_premium` | Employer pays this percent of the household premium. |
| `percent_of_employee_only` | Employer pays this percent of the employee-only rate. Dependents are paid by the employee. |
| `flat_per_employee` | Employer pays a flat cent amount per enrolled employee, capped at the premium. |

`GET /v1/quotes/{id}?format=csv` downloads the comparison.

## What is real, and what is a sample

| Data | Label in the product | Source |
| --- | --- | --- |
| Blue Shield of California small-group medical, dental, and vision for Q4 2026 | Blue Shield of California, from public filed rates, indicative | Public rate book `A46124GRP-2026Q4-SmallBusinessRateBook.pdf`, effective October 1–December 31, 2026. https://www.blueshieldca.com/en/employer/resources/rates |
| California ZIP to rating region | Used only for those filed rates | Census 2020 ZCTA-to-county file, plus the rate book's county groupings. Los Angeles uses the book's published region 15 ZIP list; other Los Angeles ZIPs are region 16. |
| Harbor Sample Health / Dental / Vision | Illustrative sample rates | Built into the repo. Not a carrier filing. |

Blue Shield rates the whole group from the **employer ZIP**, not each member's home ZIP. California small group does not apply a tobacco factor, so a tobacco flag does not change a filed premium. The age amounts are the cells printed in the book. They are not recomputed from the federal age curve, because that rounding can be off by a cent.

Checked against the Q4 2026 book text:

| Plan | Region | Age | Published monthly |
| --- | --- | --- | --- |
| Platinum Trio HMO 0/20 OffEx | 1 | 21 | $740.34 |
| Platinum Trio HMO 0/20 OffEx | 1 | 40 | $946.15 |
| Platinum Trio HMO 0/20 OffEx | 14 | 21 | $487.36 |
| Platinum Trio HMO 0/20 OffEx | 19 | 21 | $535.02 |
| Platinum Trio HMO 0/20 OffEx | 19 | 40 | $683.75 |
| Platinum Full PPO 250/10 OffEx | 1 | 21 | $830.77 |
| Platinum Full PPO 250/10 OffEx | 1 | 40 | $1,061.72 |
| Gold Full PPO 1000/30 OffEx | 19 | 21 | $656.26 |
| Gold Full PPO 1000/30 OffEx | 19 | 40 | $838.70 |
| Gold DPPO/$1500/U90 (D714), employee only | 19 | tier | $73.80 |
| Basic Vision 0/0/120 (V517), employee only | all | tier | $10.50 |

Region 13 has no Trio HMO table in this book. Trio plans are stored for the other 18 regions. Full PPO plans are stored for all 19. CMS Exchange Rate PUFs are not loaded: they exclude California, which is a state-based exchange.

Regenerate the JSON after a new quarter's PDF:

```bash
pdftotext -layout path/to/rate-book.pdf /tmp/bsca/full.txt
curl -fsSL -o /tmp/census/zcta.txt \
  https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt
npm run import:blueshield
```

## Illustrative rating math

Sample plans still use, per covered person, rounded to the cent:

`base rate × federal age factor × ZIP area factor × tobacco factor (1.5 when tobacco is yes)`

Age factors for 21–64 are the HHS default standard age curve from the CMS market-reforms guidance of February 25, 2013. Ages 0–20 use the child curve in the CMS bulletin of December 16, 2016. Unknown sample ZIPs use area factor 1.00 and the quote says so.

`POST /v1/plans` and `POST /v1/rating-areas` are admin-only. `POST /v1/catalog/reset-sample` restores the illustrative portfolio and removes the filed import until the next boot. The default small-group maximum is 50 eligible employees. Participation under 75% is a warning, not a block.

## Vercel and Supabase

The app is Next.js. Vercel detects it from `next.config.ts`. Do not add an `outputDirectory` override. `/`, `/login`, `/signup`, `/groups`, and `/finch/callback` are the console. `/v1`, `/health`, and `/docs` are served by Next route handlers that call the same API used in tests.

Supabase project ref: `pdqxwncosrrlzhqlvofd`, region `us-west-1`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | production | Postgres pooler URI, port 6543. Local default is `file:./data/agency.db` |
| `NEXT_PUBLIC_SUPABASE_URL` | production | `https://pdqxwncosrrlzhqlvofd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | production | Supabase anon key. Public in the browser. Never the service role |
| `SUPABASE_URL` | no | Server alias for the project URL |
| `SUPABASE_ANON_KEY` | no | Server alias for the anon key |
| `APP_SECRET` | production | 32+ characters. Encrypts Finch tokens |
| `SEED_BROKER_EMAIL` | local password mode | First user when the table is empty |
| `SEED_BROKER_PASSWORD` | only if you seed a password user | 12+ characters in production, and not `demo1234` |
| `SEED_BROKER_NAME` | no | Display name. Defaults to Avery Chen |
| `WEB_ORIGIN` | split dev servers | CORS origin. Defaults to `http://localhost:3000` |
| `AUTH_MODE` | no | `password` or `supabase`. Production always uses Supabase |
| `FINCH_CLIENT_ID` | no | Finch app. Blank keeps CSV census working |
| `FINCH_CLIENT_SECRET` | no | Finch secret |
| `FINCH_REDIRECT_URI` | with Finch | Must match the Finch dashboard, origin plus `/finch/callback` |
| `FINCH_API_BASE` | no | Defaults to `https://api.tryfinch.com` |
| `FINCH_SANDBOX` | no | `finch` or `provider` |
| `AI_BASE_URL` | no | OpenAI-compatible chat endpoint |
| `AI_API_KEY` | no | Omit to keep the template narrative |
| `AI_MODEL` | no | Defaults to `gpt-4o-mini` |
| `BCRYPT_ROUNDS` | no | Defaults to 10 |
| `PORT` / `HOST` | local API process | Ignored by Vercel |
| `NODE_ENV` | set by Vercel | Production requires the Supabase and Postgres settings |
| `BRAND_PRODUCT_NAME` | no | Replaces the placeholder product name |
| `BRAND_AGENCY_NAME` | no | Replaces the placeholder agency name |
| `BRAND_MARK` | no | One to three characters shown when no logo is set |
| `BRAND_LOGO_URL` | no | `https` URL or a site path. `javascript:` URLs are ignored |
| `BRAND_COLOR_INK` | no | `#rgb` or `#rrggbb` |
| `BRAND_COLOR_MUTED` | no | Secondary text |
| `BRAND_COLOR_PAPER` | no | Page background |
| `BRAND_COLOR_PANEL` | no | Card background |
| `BRAND_COLOR_LINE` | no | Borders |
| `BRAND_COLOR_ACCENT` | no | Primary buttons |
| `BRAND_COLOR_ACCENT_INK` | no | Links |
| `BRAND_COLOR_KICKER` | no | Small headings |
| `BRAND_COLOR_KICKER_WASH` | no | Notice background |
| `BRAND_COLOR_DANGER` | no | Errors |
| `BRAND_COLOR_RAIL` | no | Sidebar |
| `BRAND_COLOR_RAIL_INK` | no | Sidebar text |
| `BRAND_COLOR_RAIL_MUTED` | no | Sidebar secondary text |
| `BRAND_COLOR_MARK` | no | Monogram background |

Sign-up and sign-in use Supabase Auth. The first account becomes the agency admin. Later accounts are brokers and only see their own groups. A verified access token is checked with `GET /auth/v1/user`, then the broker row is stored in Postgres. Groups, census rows, quotes, and Finch connections (tokens encrypted with `APP_SECRET`) are in the same database. On boot the app creates tables and turns on row level security with no anon policies, so the public Supabase API cannot read them. The server connects as the database owner.

In the Supabase dashboard, set Site URL to the Vercel origin and add `https://<deployment>/auth/callback` and `http://localhost:3000/auth/callback` to the redirect allow list. If email confirmation is on, new accounts see a “check your email” message until they open the link. Turn confirmation off only if you want a session immediately after sign-up.

Copy the database URI from Project Settings → Database → Connection string → Transaction pooler. If that host differs from `aws-0-us-west-1.pooler.supabase.com`, use the dashboard value. Session mode on port 5432 is the fallback if the pooler rejects a query.

## Finch

Create an application at https://dashboard.tryfinch.com and set:

```
FINCH_CLIENT_ID
FINCH_CLIENT_SECRET
FINCH_REDIRECT_URI=http://localhost:3000/finch/callback
FINCH_SANDBOX=finch
```

The redirect URI must match the Finch dashboard. The app requests `company`, `directory`, `individual`, `employment`, and `benefits`.

`POST /v1/groups/{id}/finch/session` returns a `connect_url`. After the employer finishes Finch Connect, the browser lands on `/finch/callback` and the console exchanges the code (`POST /v1/groups/{id}/finch/exchange`) and imports the census (`POST /v1/groups/{id}/finch/sync`).

Access tokens are encrypted at rest with `APP_SECRET` (AES-256-GCM). They are not written to logs. Finch money amounts are treated as cents and annualized from the income unit. Benefit-plan reads use `/employer/plans`, `/employer/plans-enrollments`, and `/employer/plans-dependents`. If that product is not enabled, the app still imports the payroll census and tries the deductions endpoint.

Without Finch credentials the quote flow works from a CSV. The payroll screen explains the missing configuration instead of failing the server.

## Recommendations

The scorer picks one plan per line. `cost` favors lower employee deductions. `richness` favors lower deductibles and higher annual maximums. `balanced` uses both, plus distance from an optional employer budget split across the lines being quoted. The narrative is a template built only from those figures.

Set `AI_API_KEY` to ask an OpenAI-compatible chat model (`AI_BASE_URL`, `AI_MODEL`) for a prose version. A reply that introduces a dollar amount not present in the quote is discarded and the template is kept.

## Development

```bash
npm test
npm run typecheck
npm run build
```

Local development uses SQLite through libSQL (`DATABASE_URL=file:./data/agency.db`). A `postgres://` or `postgresql://` URL, including the Supabase pooler, uses Postgres instead. Production refuses to boot on SQLite. Do not commit `.env`.
