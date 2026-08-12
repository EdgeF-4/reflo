# Reflo

Reflo is a runnable, self-hosted demonstration of partner referral attribution and commission settlement
for maintainers inspecting the June 2026 predecessor to `partner-attribution-ledger`.
It exists to preserve a reproducible historical snapshot, not to compete with the maintained successor:
product evaluators and new contributors should use the successor because two public product identities
split trust and support.

> [!IMPORTANT]
> Owner recommendation: make Reflo private after review.
> If it must remain visible, archive it and retain this successor pointer.
> Delete neither repository.

## Known limits

- Live conversion fraud blocking is outside the verified scope. Do not rely on block behavior from this snapshot.
- The 50 unit tests cover the pure domain package only. They do not cover HTTP routes, browser behavior, queue jobs, or cross-tenant isolation.
- Seeded credentials and fallback secrets are for loopback evaluation only.
- The optional external model-provider path and protocol write behavior are outside the verified scope.
- Dependency majors that require product migrations are held deliberately and documented in [DEPENDENCIES.md](DEPENDENCIES.md). New platform work belongs in the maintained successor.
- This snapshot is not supported for production, new integrations, or new feature work.

## Quickstart

Requirements:

- Docker with Compose
- `curl` and `jq` for the live smoke check
- Node.js 20 or newer for the domain tests
- At least 2 GB of free memory for the initial builds

From the repository root:

```bash
docker compose up --build --wait
```

The command waits until the first run has built the API and web app, created a fresh database, applied four migrations, seeded a demo workspace, and passed the service health checks. Then open:

- Dashboard: http://localhost:3000
- Health check: http://localhost:4000/health

Confirm the API is ready:

```bash
curl --fail --silent --show-error http://localhost:4000/health
```

Expected response:

```json
{"status":"ok","database":"up"}
```

The login page provides pre-filled demo credentials and buttons for the admin, analyst, and partner roles.

The API and web app bind to `127.0.0.1`. The database and cache stay inside the Compose network and are not published to the host.

When finished, stop the demo without removing its containers or data:

```bash
docker compose stop
```

## Verify the running demo

In another terminal:

```bash
npm ci
npm run test:smoke
```

The smoke script requires `curl` and `jq`. It checks health, the web response, both primary demo roles, seeded reports, deterministic insights, and partner-scoped views without printing session tokens.

## Unit tests

```bash
npm ci
npm run test:domain
```

Expected result:

```text
Test Files  6 passed (6)
Tests       50 passed (50)
```

These tests cover exact-cent allocation, ledger state transitions, five attribution models, commission rules, and pure fraud-signal scoring.

## Dependency check

```bash
npm ci
npm audit --audit-level=low
npm run test:dependencies
npm ls cron-parser
```

The advisory check returns zero known vulnerabilities on this branch.
The contract check confirms exact direct pins and the tree resolves supported
`cron-parser@5.8.1` beneath `bullmq@6.1.0`. Current major holds and their tested
compatibility reasons are recorded in [DEPENDENCIES.md](DEPENDENCIES.md).

## What these commands prove

`docker compose up --build --wait` and `npm run test:smoke` prove only that the local API, web app, database health, seeded admin views, seeded partner views, reports, ledger reads, deterministic insights, and actionable HTTP failure responses work together.

`npm run test:domain` proves only the pure money, attribution, commission, ledger-transition, fraud-scoring, and actionable domain-error cases represented by its 50 tests.

They do not prove production hardening, cross-tenant isolation, live fraud blocking, backup recovery, queue recovery, or protocol write behavior.

## Troubleshooting

### `Pool overlaps with other one on this address space`

The demo's explicit local subnet conflicts with another route on this machine.
Do not remove networks you do not own. Ask the Docker administrator for an
unused private `/24`, then retry with that value:

```bash
REFLO_SUBNET=<unused-private-subnet> docker compose up --build --wait
```

### `curl: (7) Failed to connect`

The Compose services are stopped or the API is not ready. Start them, wait for the command to report healthy services, then retry:

```bash
docker compose up --build --wait
curl --fail --silent --show-error http://localhost:4000/health
npm run test:smoke
```

If it still fails, inspect the local services and API log:

```bash
docker compose ps
docker compose logs api
```

### `missing required command: curl` or `missing required command: jq`

Install the named command with your operating system's package manager, verify both are available, then rerun the smoke check:

```bash
command -v curl
command -v jq
npm run test:smoke
```

### `vitest: not found`

The Node.js dependencies were not installed in this checkout. From the repository root, run:

```bash
npm ci
npm run test:domain
```

## Design decision

Reflo keeps a runnable snapshot instead of replacing the repository with a one-line successor link. That preserves historical behavior for local inspection. The cost is a second dependency surface and a duplicate public identity, which is why the recommendation is to make this repository private after review rather than resume development here.

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
