# Dependency policy

Reflo is a superseded runnable snapshot, so dependency work preserves the
verified demo instead of beginning another product migration. Every direct
dependency is exact-pinned and `package-lock.json` fixes the transitive tree.

## Verified updates on 2026-08-12

- BullMQ 6.1.0 replaces 5.81.3. Its queue API passed the API build and live
  Compose smoke path. The tree now uses supported `cron-parser` 5.8.1 instead
  of deprecated 4.9.0.
- ioredis 6.0.0 replaces 5.11.1 and passed the same queue-worker smoke path.
- Nest HTTP packages are aligned on 11.1.29.
- The protocol server uses the current `registerTool` API in SDK 1.30.0 rather
  than its deprecated `tool` API.
- The API and web runtimes use the current minimal Node image at an immutable
  digest. Build tooling is confined to the development-image stages, and the
  deployed images run as user 65532.
- PostgreSQL stays on 16.14 through a small Alpine image built from an
  immutable base and exact operating-system packages. This avoids an
  unnecessary data-major migration. Redis 7 is also pinned by digest.
- Cached Trivy 0.73 scans cover UNKNOWN, LOW, MEDIUM, HIGH, and CRITICAL
  severities and fail on the first finding. The API, web, database, and cache
  images each return zero findings.

## Deliberate holds

- TypeScript is held at 5.9.3. TypeScript 7.0.2 removed the programmatic
  compiler API used by Nest CLI 11.0.24. TypeScript 6.0.3 restored that API,
  but Next 16.3.0 could not parse its compiler configuration output. Both
  attempted builds stopped before producing an artifact; 5.9.3 builds all
  four workspaces. The web build uses Next's stable compiler API because its
  CLI output-capture path is unreliable on newer Node runtimes.
- Zod is held at 3.25.76. SDK 1.30.0 supports this line. In this workspace its
  schema-converter dependency resolves Zod 3 internally, and an attempted Zod
  4.4.3 build produced incompatible schema types. A dual-major override would
  make the frozen protocol demo less reliable.
- Tailwind CSS is held at 3.4.19. Version 4 requires a CSS and PostCSS compiler
  migration. That redesign belongs in the maintained successor, not this
  historical snapshot.
- Node type declarations are held at 20.19.43 because Node 20 is the documented
  minimum for source verification. The container uses the current minimal Node
  runtime, but using newer declarations would allow APIs unavailable to that
  supported source-install floor.

These holds are compatibility decisions, not ignored advisories. The registry
audit is clean. Revisit them only if this repository becomes maintained again.
