# Reflo

**Superseded local demo for partner attribution and settlement.**

> [!IMPORTANT]
> This repository is a June 2026 snapshot.
> Use the public repository named `partner-attribution-ledger` for product evaluation and new work.
> Keeping both repositories positioned as separate products creates avoidable confusion.

Reflo demonstrates first-party referral ingest, multi-touch attribution, exact-cent commission allocation, an append-only settlement ledger, role-scoped dashboards, and deterministic fraud scoring. It is useful as a local technical sample, but it is not the maintained product.

## Known limits

- The live conversion route does not prove fraud blocking. An audit burst reached `review`, not `block`, because the API supplies only part of the domain scorer's signal set.
- The 46 unit tests cover the pure domain package only. They do not cover HTTP routes, browser behavior, queue jobs, or cross-tenant isolation.
- Seeded credentials and fallback secrets are for loopback evaluation only.
- The optional external model-provider path was not exercised.
- The protocol server builds, but its write tools were not executed during this audit.

## Quickstart

Requirements:

- Docker with Compose
- At least 2 GB of free memory for the initial builds

From the repository root:

```bash
docker compose up --build
```

The first run builds the API and web app, creates a fresh database, applies four migrations, and seeds a demo workspace. When the API reports that it is listening, open:

- Dashboard: http://localhost:3000
- Health check: http://localhost:4000/health

The login page provides pre-filled demo credentials and buttons for the admin, analyst, and partner roles.

The API and web app bind to `127.0.0.1`. The database and cache stay inside the Compose network and are not published to the host.

Press `Ctrl+C` in the Compose terminal to stop the demo.

## Verify the running demo

In another terminal:

```bash
npm install
npm run test:smoke
```

The smoke script requires `curl` and `jq`. It checks health, the web response, both primary demo roles, seeded reports, deterministic insights, and partner-scoped views without printing session tokens.

## Unit tests

```bash
npm install
npm run test:domain
```

Expected result:

```text
Test Files  5 passed (5)
Tests       46 passed (46)
```

These tests cover exact-cent allocation, ledger state transitions, five attribution models, commission rules, and pure fraud-signal scoring.

## Verified implementation scope

- Sixteen database tables have forced row-level-security policies in the seeded demo.
- The runtime database role cannot update or delete append-only ledger events.
- The public tracking endpoint accepted an allowed demo domain and rejected a disallowed domain.
- A live conversion produced an attributed result and conserved its commission total to the cent.
- The seeded admin and partner views returned scoped dashboard data.
- The domain, API, web, widget, and protocol-server workspaces build from this branch.

This verification does not turn the snapshot into a production deployment. Production hardening, end-to-end isolation tests, live fraud blocking, backup procedures, and upgrade operations belong in the maintained successor.

## Project layout

```text
packages/domain/   Pure attribution, commission, ledger, and fraud logic
packages/widget/   Browser tracking script and demo page
apps/api/          HTTP API, migrations, seed, reports, and queue worker
apps/web/          Admin dashboard and partner portal
apps/mcp/          Optional protocol server over standard input and output
db/migrations/     Schema and row-level-security policies
scripts/           Local verification and the disabled legacy publisher
```

## License

Apache-2.0. See [LICENSE](LICENSE).
