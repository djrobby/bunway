---
sidebar_position: 2
title: Getting started
---

# Getting started

## Requirements

- Bun 1.4 or newer
- No Node.js installation is required; generated tooling is explicitly executed with Bun.
- PostgreSQL for the default adapter, MySQL for `--database=mysql`, SQLite with no server,
  or a running PocketBase service for `--database=pocketbase`.

Create an application and install its dependencies:

```sh
bun add --global @bunway/cli
bun create bunway shop
cd shop
cp .env.example .env
```

Set `DATABASE_URL` in `.env` (SQLite is preconfigured with a file path), then create a resource and
apply its migration:

```sh
bunway g scaffold Product name:string price:decimal active:boolean
bunway db:migrate
bunway dev
```

The API listens on port `3000` by default and SvelteKit on port `5173`. `bunway dev` starts both
processes and forwards their output.

## Generated application

```text
src/app.ts                 Elysia composition and exported App type
src/db/index.ts            Drizzle database connection
src/db/schema/             ordinary Drizzle schemas
src/db/migrations/         Drizzle Kit SQL migrations
src/routes/                composable Elysia route modules
src/jobs/                  registered background jobs
src/storage.ts             selected object-storage adapter
web/                       ordinary SvelteKit application
tests/                     Bun smoke tests
```

Generated routes are registered explicitly. Generated schema modules are exported explicitly. This
keeps the application understandable without runtime discovery or framework magic.

## First production check

```sh
bun run typecheck
bun test
bun run build
```

Use the underlying Elysia, Drizzle, Bun.SQL, SvelteKit, and Svelte APIs directly whenever generated code
needs application-specific behavior.

## API-only applications

```sh
bunway new inventory-api --api-only
```

API-only projects omit the `web/` workspace. `bunway dev` starts only Elysia, and `scaffold` generates
the Drizzle schema, validated API routes, registration, and tests without frontend files.
