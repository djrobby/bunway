---
title: 1. Create and understand the app
---

# 1. Create and understand the app

We use PostgreSQL because Jobs require its locking semantics. The command below creates the project,
installs dependencies, and defaults Drizzle Kit's migration client to `pg`:

```sh
bun create bunway showcase
cd showcase
cp .env.example .env
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp` if `cp` is not available. To select
Postgres.js for migration tooling instead, create with:

```sh
```

Application queries use Bun.SQL in either case.

Create the local database with PostgreSQL's `createdb` command:

```sh
createdb -U postgres bunway_showcase
```

If PostgreSQL is in Docker or managed elsewhere, create an empty database using that provider's normal
UI instead. Open `.env` and replace its `DATABASE_URL` line with your real username, password, host,
port, and database:

```dotenv
DATABASE_URL=postgres://postgres:postgres@localhost:5432/bunway_showcase
```

```sh
bunway db:migrate
bunway dev
```

`db:migrate` now checks that the selected migration client is physically installed and runs
`bun install` to repair it when necessary. If an older CLI still reports that no PostgreSQL driver is
available, repair that application once with `bun add --dev pg`.

The API starts on 3000 and SvelteKit normally on 5173. Read `src/app.ts` (Elysia HTTP composition),
`src/db/index.ts` (Drizzle), and `web/src/routes/+page.svelte` (SvelteKit). Bunway supplied conventions
and generated source, not replacement layers.

:::tip Verify it
Open `http://localhost:3000` and `http://localhost:5173`. In another terminal, from `showcase/`, run
`bunway routes`. You should see `GET /` plus the framework-owned Storage and Realtime transport routes.
:::

Next: [generate the first resource](./02-resource.md).
