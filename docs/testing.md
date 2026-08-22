---
title: Testing
---

# Testing

Bunway uses Bun test and favors small tests that protect developer-visible behavior.

Root test discovery is limited to `tests/`. The `local-package-smoke` fixture is intentionally excluded
because its PostgreSQL tests require `DATABASE_URL`; run those separately only when exercising the local
package fixture. Release validation does not require database credentials.

Release package preflight uses `bun pm pack --dry-run`. This validates the publish contents locally
without asking npm to resolve a workspace dependency version that has not been published yet.

The release command verifies npm authentication before changing package versions. Interactive runs can
open `npm login --auth-type=web`; `--yes` automation must provide `NPM_CONFIG_TOKEN`. Publishing the
scoped packages also requires membership or ownership permission for the `bunway` npm scope.

```sh
bun test
bun run typecheck
bun run build
```

Resource and scaffold generators create validation smoke tests. Add database-backed CRUD coverage for
important resources, call `performNow()` for job handler behavior, and use `workOnce()` when the queue
lifecycle matters. Realtime tests can subscribe to the in-process broker or exercise the Elysia SSE/WS
routes. Authentication tests should use Better Auth's generated HTTP endpoints; Audit tests should query
`audit_logs` with Drizzle; Messaging tests should use console or injected drivers rather than real providers.

Use a disposable database and apply migrations before integration tests. Bunway does not prescribe a
parallel test-database manager, browser runner, or coverage target. Add infrastructure when the application
actually needs it.
