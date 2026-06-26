# MMA Benefits

A full-stack employee-benefits app: a member's digital wallet (insurance cards),
coverage details, copays, claims/EOBs, a cost estimator, HSA/FSA accounts, an
in-network provider finder, a benefits Q&A assistant, and a support channel to a
benefits-advocacy team.

It started as a single-file React prototype (kept at [`prototype/index.html`](prototype/index.html))
and is now a real Next.js application with authentication, a database, APIs, and
an optional Claude-powered assistant.

## Tech stack

| Concern        | Choice                                              |
| -------------- | --------------------------------------------------- |
| Framework      | Next.js (App Router) + TypeScript + React           |
| Database       | libSQL (SQLite dialect) — local file in dev, [Turso](https://turso.tech) in prod |
| ORM            | Drizzle ORM (+ drizzle-kit)                         |
| Auth           | Auth.js (NextAuth v5), credentials + JWT sessions   |
| AI (optional)  | Anthropic Claude via `@anthropic-ai/sdk`            |
| Validation     | Zod                                                 |

## Quick start

```bash
npm install
cp .env.example .env          # then edit .env (see below)
npm run db:push               # create tables
npm run db:seed               # load the demo household (the Fraziers)
npm run dev                   # http://localhost:3000
```

Sign in with the seeded demo account:

- **Email:** `kolaiah@example.com`
- **Password:** `demo1234`

### Environment

The only values needed for local dev are already defaulted in `.env.example`:

- `DATABASE_URL` — `file:./prisma-dev.db` for local; a `libsql://…turso.io` URL
  (+ `DATABASE_AUTH_TOKEN`) in production.
- `AUTH_SECRET` — generate with `openssl rand -base64 32`.
- `ANTHROPIC_API_KEY` — **optional.** See "Ask AI" below.

## The "Ask AI" assistant (API key is optional)

The assistant works with **no API key**. When `ANTHROPIC_API_KEY` is unset,
`POST /api/chat` returns `503` and the client transparently falls back to an
on-device answer engine grounded in the member's real plan data — so the feature
is fully functional offline.

Set `ANTHROPIC_API_KEY` to upgrade it to live Claude (`ANTHROPIC_MODEL`,
default `claude-opus-4-8`), grounded server-side in the member's coverage,
balances, copays, and recent claims. The key is **server-side only** and never
reaches the browser.

## Project layout

```
src/
  app/
    page.tsx                 # authed entry — loads data, renders the app
    login/page.tsx           # credentials sign-in
    BenefitsApp.tsx          # the full UI (client), fed by DB data
    api/
      auth/[...nextauth]/    # Auth.js handlers
      chat/route.ts          # Claude assistant (optional) + 503 fallback
      support/route.ts       # persists messages to the advocacy team
  auth.ts                    # Auth.js config (bcrypt over the users table)
  db/
    schema.ts                # Drizzle schema
    index.ts                 # db client
    seed.ts                  # demo data
  lib/
    bootstrap.ts             # shapes DB rows into the UI's data model
    grounding.ts             # builds the assistant's context from real data
    session.ts               # requireUserId / getUserId helpers
    integrations/            # insurer + wallet seams (see below)
prototype/index.html         # the original single-file prototype
```

## Scripts

- `npm run dev` / `build` / `start`
- `npm run db:push` — apply schema to the database
- `npm run db:seed` — seed demo data
- `npm run db:reset` — wipe + recreate + reseed (dev only)

## Deployment

1. **Database:** create a Turso database, set `DATABASE_URL` + `DATABASE_AUTH_TOKEN`,
   then `npm run db:push && npm run db:seed`.
2. **Host:** deploy to Vercel (or any Node host). Set `AUTH_SECRET`,
   `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, and optionally `ANTHROPIC_API_KEY`.
3. `npm run build` runs the production build.

## Integrations that need your credentials

These are real product surfaces that require contracts/secrets that can't live
in a repo. Each has a typed seam with a stub that throws a clear error until
configured:

- **Insurer / claims feed** — [`src/lib/integrations/insurer.ts`](src/lib/integrations/insurer.ts).
  Keep claims and accumulators fresh from the payer/clearinghouse (EDI 837/835
  or FHIR; vendors: Availity, Change Healthcare, Stedi).
- **Apple / Google Wallet passes** — [`src/lib/integrations/wallet.ts`](src/lib/integrations/wallet.ts).
  Issue real `.pkpass` / Google Wallet passes (needs an Apple Pass Type ID +
  cert, and a Google Wallet issuer account).

## Security & HIPAA checklist

This app handles PHI. Before any real member data:

- [ ] Sign a **BAA** with every vendor touching PHI (host, database, AI provider, email).
- [ ] Force HTTPS everywhere; HSTS; secure, httpOnly session cookies (default here).
- [ ] Encrypt data at rest (Turso/Postgres) and in transit.
- [ ] Replace the demo credentials provider with SSO/MFA or strong password policy + rate limiting.
- [ ] Add audit logging for PHI access and an access-review process.
- [ ] Scope every query to the authenticated user (done via `requireUserId`/`getUserId`).
- [ ] Configure log redaction so PHI never lands in logs or error trackers.
- [ ] Data retention & deletion policy; least-privilege access to the database.

## What's real vs. demo today

- **Real:** auth + sessions, persistent database, per-user data scoping, all
  screens reading live data, support messages saved server-side, optional live
  Claude assistant with on-device fallback.
- **Demo:** seeded household data; "Add to Wallet" confirms optimistically;
  claims are seeded rather than synced from a payer. Wire the integrations above
  to make those live.
