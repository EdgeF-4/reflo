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
- The 46 unit tests cover the pure domain package only. They do not cover HTTP routes, browser behavior, queue jobs, or cross-tenant isolation.
- Seeded credentials and fallback secrets are for loopback evaluation only.
- The optional external model-provider path and protocol write behavior are outside the verified scope.
- Dependency maintenance is incomplete because one queue dependency still carries a deprecated transitive parser. Major queue work belongs in the maintained successor.
- This snapshot is not supported for production, new integrations, or new feature work.

## Quickstart

Requirements:

- Docker with Compose
- `curl` and `jq` for the live smoke check
- Node.js 20 or newer for the domain tests
- At least 2 GB of free memory for the initial builds

From the repository root:

```bash
docker compose up --build
```

The first run builds the API and web app, creates a fresh database, applies four migrations, and seeds a demo workspace. When the API reports that it is listening, open:

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

## Dependency check

```bash
npm install
npm audit --audit-level=low
npm ls cron-parser
```

The advisory check returns zero known vulnerabilities on this branch.
The tree check also exposes the deferred `cron-parser@4.9.0` dependency beneath `bullmq@5.81.3`.

## What these commands prove

`docker compose up --build` and `npm run test:smoke` prove only that the local API, web app, database health, seeded admin views, seeded partner views, reports, ledger reads, and deterministic insights work together.

`npm run test:domain` proves only the pure money, attribution, commission, ledger-transition, and fraud-scoring cases represented by its 46 tests.

They do not prove production hardening, cross-tenant isolation, live fraud blocking, backup recovery, queue recovery, or protocol write behavior.

## Troubleshooting

### `all predefined address pools have been fully subnetted`

The local Docker daemon has exhausted its network address pools before Reflo can create its Compose network.
Do not remove networks you do not own.
Ask the Docker administrator to reclaim unused Compose networks or expand Docker's configured address pools,
then rerun:

```bash
docker compose up --build
```

### `curl: (7) Failed to connect`

The Compose process is stopped or the API is not ready. Keep `docker compose up --build` running in its first terminal, wait for `Reflo API listening on :4000`, then retry:

```bash
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
npm install
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
