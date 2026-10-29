# Harbor Agency

Open-source general agency for small-group **medical, dental, and vision** quoting. The HTTP API is the product. The browser is a console on top of it.

Harbor is GPL-3.0-only. See [LICENSE](LICENSE).

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

In a second terminal:

```bash
npm run dev:web
```

Open http://localhost:5173 and sign in as `broker@example.com` / `demo1234`.

API docs: http://localhost:8787/docs

OpenAPI: http://localhost:8787/v1/openapi.json

Production refuses to boot on the default broker password. Set `APP_SECRET` (32+ characters) and `SEED_BROKER_PASSWORD` (12+ characters).

```bash
docker build -t harbor-agency .
docker run --rm -p 8787:8787 \
  -e APP_SECRET="$(openssl rand -base64 32)" \
  -e SEED_BROKER_PASSWORD="$(openssl rand -base64 18)" \
  -e SEED_BROKER_EMAIL=you@agency.example \
  -v harbor-data:/app/data \
  harbor-agency
```

The image serves the console and the API on port 8787.

## Quote from the API

```bash
TOKEN=$(curl -s -X POST localhost:8787/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"broker@example.com","password":"demo1234"}' | jq -r .token)

GROUP=$(curl -s -X POST localhost:8787/v1/groups \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"legal_name":"Northwind Studio","state":"CA","zip":"92101","effective_date":"2026-07-01"}' \
  | jq -r .group.id)

curl -s -X PUT "localhost:8787/v1/groups/$GROUP/census" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: text/csv' \
  --data-binary @examples/northwind-census.csv

curl -s -X POST "localhost:8787/v1/groups/$GROUP/quotes" \
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

## Rate tables

`POST /v1/plans` and `POST /v1/rating-areas` are admin-only. Medical plans need an age-21 monthly `base_rate_cents`. Dental and vision plans need `tier_rates_cents`. Set `rate_basis` to `agency_loaded`.

`POST /v1/catalog/reset-sample` restores the illustrative portfolio.

Medical math, per covered person, rounded to the cent:

`base rate × federal age factor × ZIP area factor × tobacco factor (1.5 when tobacco is yes)`

Age factors for 21–64 are the HHS default standard age curve from the CMS market-reforms guidance of February 25, 2013. Ages 0–20 use the child curve in the CMS bulletin of December 16, 2016. Unknown ZIPs use area factor 1.00 and the quote says so. The default small-group maximum is 50 eligible employees. Participation under 75% is a warning, not a block.

## Finch

Create an application at https://dashboard.tryfinch.com and set:

```
FINCH_CLIENT_ID
FINCH_CLIENT_SECRET
FINCH_REDIRECT_URI=http://localhost:5173/finch/callback
FINCH_SANDBOX=finch
```

The redirect URI must match the Finch dashboard. Harbor requests `company`, `directory`, `individual`, `employment`, and `benefits`.

`POST /v1/groups/{id}/finch/session` returns a `connect_url`. After the employer finishes Finch Connect, the browser lands on `/finch/callback` and the console exchanges the code (`POST /v1/groups/{id}/finch/exchange`) and imports the census (`POST /v1/groups/{id}/finch/sync`).

Access tokens are encrypted at rest with `APP_SECRET` (AES-256-GCM). They are not written to logs. Finch money amounts are treated as cents and annualized from the income unit. Benefit-plan reads use `/employer/plans`, `/employer/plans-enrollments`, and `/employer/plans-dependents`. If that product is not enabled, Harbor still imports the payroll census and tries the deductions endpoint.

Without Finch credentials the quote flow works from a CSV. The payroll screen explains the missing configuration instead of failing the server.

## Recommendations

The scorer picks one plan per line. `cost` favors lower employee deductions. `richness` favors lower deductibles and higher annual maximums. `balanced` uses both, plus distance from an optional employer budget split across the lines being quoted. The narrative is a template built only from those figures.

Set `AI_API_KEY` to ask an OpenAI-compatible chat model (`AI_BASE_URL`, `AI_MODEL`) for a prose version. A reply that introduces a dollar amount not present in the quote is discarded and the template is kept.

## Development

```bash
npm test
npm run typecheck
npm run build:web
```

The database is SQLite through libSQL (`DATABASE_URL=file:./data/agency.db`). Point it at a `libsql://` URL for a hosted database. Do not commit `.env`.
