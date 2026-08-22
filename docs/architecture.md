---
title: Architecture
---

# Architecture

Bunway is a generator-first productivity layer. `create-bunway` configures the starter,
`@bunway/cli` writes application-owned source, and `@bunway/core` supplies the few justified runtimes:
PostgreSQL Jobs, process-local Realtime, Storage/attachments, Messaging, and a database type helper.

```text
Browser
  ▼
SvelteKit / Svelte 5 ── Eden Treaty ──► Elysia
                                          │
                  ┌───────────────────────┼─────────────────┐
                  ▼                       ▼                 ▼
          Drizzle / native DB        Realtime broker    Bunway Jobs
                  │                  SSE / WebSocket         │
                  ▼                       │                  ▼
       primary + named databases     transient clients   PostgreSQL
            ┌─────┼─────┐
            ▼     ▼     ▼
          Auth  Audit  application data

Messaging ── sendLater ──► Jobs
    ├── delivery outcomes ──► Audit
    └── Mail / SMS providers

Storage metadata ──► Drizzle     Storage objects ──► local disk or S3
```

## Boundaries

| Concern | Owner | Bunway boundary |
| --- | --- | --- |
| HTTP/validation | Elysia | generated routes; no controller/router layer |
| data queries | Drizzle and native database clients | no Bunway ORM/repository |
| browser | SvelteKit/Svelte | no Bunway frontend runtime |
| API types | Eden Treaty | inferred; no duplicate DTO protocol |
| async execution | Jobs | durable PostgreSQL queue |
| connected delivery | Realtime | transient in-memory SSE/WebSocket |
| historical facts | Audit | direct insert, queried with Drizzle |
| identity/session | Better Auth | generated configuration and schema |
| external communication | Messaging | Mail/SMS now, Jobs later, Audit outcomes |
| file bytes | Storage | Drizzle metadata, local/S3 objects |

Messaging may call Jobs and Audit; it does not depend on Realtime. Audit does not call Jobs or Realtime.
Applications explicitly publish when a browser needs an update.

## Named databases

`src/db/config.ts` declares `primary` and optional named databases. Primary keeps the shallow schema and
migrations directories; additional SQL databases have their own directories and Drizzle config.
PostgreSQL uses Drizzle over Bun.SQL, MySQL uses mysql2, and SQLite uses `bun:sqlite`. Relationships
never cross databases.

Jobs choose a named PostgreSQL database through `BUNWAY_JOBS_DATABASE`. Auth and Audit import their
selected database explicitly. Bunway does not fake cross-database transactions.

## Generated code

```text
Bunway CLI → ordinary Elysia / Drizzle / SvelteKit source → developer owns and edits it
```

Registrations are explicit. Runtime discovery, base models, reflection, dependency injection, and a
proprietary protocol are absent.

## Current limitations

Realtime is process-local. Jobs require PostgreSQL. Local storage needs persistent shared disk when
processes or hosts multiply.
