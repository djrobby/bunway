---
title: 1. Create and understand the app
---

# 1. Create and understand the app

Choose one database. PostgreSQL is the default and enables every Showcase feature, including durable
Jobs. MySQL and SQLite run the CRUD, relationships, storage, Blog, Realtime transports, Auth, Audit,
and immediate Messaging demonstrations; skip the explicitly marked PostgreSQL-only queue steps.

### PostgreSQL (default)

```sh
bun create bunway showcase
cd showcase
cp .env.example .env
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp` if `cp` is not available. Application
queries and migration application use Bun.SQL; Drizzle Kit generates the migration SQL.

Create the local database with PostgreSQL's `createdb` command:

```sh
createdb -U postgres showcase_development
```

If PostgreSQL is in Docker or managed elsewhere, create an empty database using that provider's normal
UI instead. Open `.env` and replace its `DATABASE_URL` line with your real username, password, host,
port, and database:

```dotenv
DATABASE_URL=postgres://postgres:postgres@localhost:5432/showcase_development
```

```sh
bunway db:migrate
bunway dev
```

`db:migrate` generates SQL with Drizzle Kit and applies it with Drizzle ORM's Bun.SQL migrator. Start
with an empty database: existing tables without matching `drizzle.__drizzle_migrations` history are a
conflict, and Bunway reports the underlying PostgreSQL error.

For Neon, create a new empty database or branch in the Neon console and paste its connection string
into `.env`; do not run the local `createdb` command.

### MySQL

```sh
bun create bunway showcase --database=mysql
cd showcase
cp .env.example .env
```

Create an empty `showcase_development` database, set the MySQL `DATABASE_URL`, then migrate:

```dotenv
DATABASE_URL=mysql://root:password@localhost:3306/showcase_development
```

```sh
bunway db:migrate
bunway dev
```

### SQLite

```sh
bun create bunway showcase --database=sqlite
cd showcase
cp .env.example .env
bunway db:migrate
bunway dev
```

SQLite uses `storage/development.sqlite` and needs no database server or URL editing. Bunway applies
SQLite migrations through Drizzle's `bun:sqlite` driver.

The API starts on 3000 and SvelteKit normally on 5173. Read `src/app.ts` (Elysia HTTP composition),
`src/db/index.ts` (Drizzle), and `web/src/routes/+page.svelte` (SvelteKit). Bunway supplied conventions
and generated source, not replacement layers.

:::tip Verify it
Open `http://localhost:3000` and `http://localhost:5173`. In another terminal, from `showcase/`, run
`bunway routes`. You should see `GET /` plus the framework-owned Storage and Realtime transport routes.
Verify the API without a browser too. On macOS/Linux use:

```sh
curl http://localhost:3000
```

On Windows PowerShell use:

```powershell
curl.exe http://localhost:3000
```

:::

Next: [generate the first resource](./02-resource.md).
