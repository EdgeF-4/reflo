# Architecture

This document explains how Reflo is put together and why. It assumes you have read the README.

## Design goals

1. **Own your data.** A program runs on your own Postgres. Nothing about a payout lives in a service you cannot inspect.
2. **Money correctness first.** The logic that moves money is pure, deterministic and unit-tested, separate from any framework or database.
3. **Isolation at the database, not just the app.** Multi-tenancy is enforced by Postgres row-level security, so a forgotten `WHERE` clause cannot leak across tenants.
4. **Cookie independence.** Attribution is recorded against a first-party identity and confirmed server to server.
5. **Auditable by construction.** Settlement is event-sourced and append-only; the audit log is immutable at the privilege level.

## Layers

```
packages/domain   pure functions, no I/O          <- the part that must be correct
db/migrations     schema + RLS policies            <- the isolation boundary
apps/api          NestJS over pg, Redis, BullMQ    <- orchestration and auth
apps/web          Next.js client app               <- admin + partner UI
apps/mcp          MCP server                       <- agent access
packages/widget   embeddable script                <- first-party capture
```

### Domain package (`packages/domain`)

Framework-free TypeScript with no database or network access. It holds:

- **money.ts** integer-cent helpers, basis-point rounding, and `allocateByWeight`, the largest-remainder split that guarantees parts sum exactly to the total.
- **ledger.ts** the settlement state machine: a `foldEntry` that replays an event stream into a current state, a transition table that rejects illegal moves, and `rollupBalance` which proves money is conserved across state buckets.
- **attribution.ts** lookback-window cleaning, de-duplication, and five weighting models that each sum to one.
- **commission.ts** evaluation of percentage, flat, tiered and recurring rules.
- **fraud.ts** deterministic scoring from velocity, duplicate, geo and dwell signals into a risk score and an allow/review/block decision.

Because this layer is pure, it is the layer with tests, and those tests are about correctness of money rather than wiring.

### Database (`db/migrations`)

Plain SQL migrations applied in order, tracked in a `schema_migrations` table so they run exactly once.

The isolation model uses two roles:

- `postgres` (superuser) runs migrations and seeding and bypasses RLS by design.
- `reflo_app` is the runtime role. It cannot bypass RLS, so every policy applies to it.

Each request sets two session variables inside a transaction:

```sql
SELECT set_config('reflo.tenant_id', $1, true);
SELECT set_config('reflo.partner_id', $2, true);  -- empty for admins
```

Policies then take one of two shapes:

- **tenant-only**: `tenant_id = reflo_current_tenant()`
- **tenant + partner**: also requires `partner_id` to match when a partner scope is set, so a partner user sees only its own rows.

A helper function raises if the tenant variable was never set, so a missing context fails closed rather than leaking. The append-only tables (`events`, `ledger_events`, `audit_log`) grant only INSERT and SELECT to `reflo_app`, making them immutable at the privilege level.

### API (`apps/api`)

NestJS with `pg` directly rather than an ORM, because RLS wants explicit per-request transaction control. The key building block is `DbService.runAs(scope, work)`, which checks out a connection, opens a transaction, sets the session variables, runs the callback, and commits or rolls back. Every business query flows through it.

Authentication is JWT. The token carries the tenant, role and (for partners) the partner id. The login and tracking-key lookups are the only queries that use the admin pool, because they must resolve identity before a tenant context exists. After that, everything is tenant-scoped.

The conversion pipeline is the heart of the API:

1. Authorize the tracking key and validate the calling domain.
2. Gather the customer's first-party touch journey.
3. Score the conversion for fraud against recent history. A block stops here.
4. Compute the commission pool from the offer's rule.
5. Attribute it across the touch journey and split to exact cents.
6. Accrue an append-only ledger entry per credited partner.
7. Schedule a hold-window auto-confirm job on the queue.

### Settlement queue (`apps/api/src/queue`)

Redis and BullMQ carry background settlement work. When a conversion accrues, each entry is scheduled to auto-confirm after a hold window, mirroring a real return period. The worker advances entries through the same state machine the domain enforces. If `REDIS_URL` is not set the queue degrades to a no-op, so the API still runs in a minimal setup.

### Web (`apps/web`)

Next.js App Router with Tailwind. The dashboards are client-rendered over the API, with the session in localStorage and role-gated layouts. One application serves both the admin dashboard and the partner portal; the partner portal's queries run with the partner scope set, so RLS guarantees a partner can only read its own data even if a query forgot to filter.

### MCP server (`apps/mcp`)

A Model Context Protocol server over stdio that wraps the HTTP API. It authenticates once and exposes read tools (summary, leaderboard, ledger, fraud, insights) and a few guarded write tools (record conversion, transition entry, run payouts). Because it goes through the API, agent actions are subject to the same RBAC, RLS and audit log as a human.

### AI layer

Provider-agnostic and optional. The client reads an OpenAI-compatible endpoint and key from a chmod-600 `config.json` that is never committed and never an environment variable, defaulting to a free NVIDIA NIM model. When no key is present, insights and fraud narratives fall back to deterministic output. The payout-gating fraud decision is always rule-based and never depends on a model.

## Request lifecycle (a conversion)

```
widget/script ──POST /track/conversion──> API
  authorize key + domain
  runAs(tenant):
    upsert customer, read touch journey
    assessConversion(...)        // fraud
    insert conversion + fraud_assessment
    computeCommission(...)       // pool
    attribute(...) + allocateByWeight(...)   // exact split
    insert attributions + ledger_entries + ledger_events(accrued)
  commit
  enqueue auto-confirm jobs
```

## Security model

- Tenant isolation enforced by Postgres RLS, not application code.
- Partner self-scoping layered into the same policies.
- Append-only event and audit tables, immutable by privilege.
- Secrets isolated: the AI key lives only in a chmod-600 file, never in the environment or the repository.
- The tracking key is a public identifier; abuse is bounded by the allowed-domain list and server-side validation.

## Deployment

`docker compose up --build` builds the API and web images from the monorepo, starts Postgres and Redis, runs migrations, seeds the demo, and serves both dashboards. In production you would set a strong `JWT_SECRET`, point `NEXT_PUBLIC_API_URL` at your public API origin, and supply your own database credentials.
