---
sidebar_position: 4
title: Databases
---

# Databases

Bunway supports multiple named databases. PostgreSQL is the default. PostgreSQL, MySQL, and SQLite
connections are ordinary Drizzle instances. Bunway provides configuration and generators, not an ORM.

## Choose an adapter

| Adapter | Best fit | Migrations | Jobs | Generated SQL Auth/Audit |
| --- | --- | --- | --- | --- |
| PostgreSQL | default production application; full field set | Drizzle Kit | yes | yes |
| MySQL | existing MySQL systems and conventional SQL apps | Drizzle Kit | use named PostgreSQL | yes |
| SQLite | local, embedded, and small single-host data | Drizzle Kit | use named PostgreSQL | yes |

PostgreSQL supports arrays and engine-specific types. MySQL and SQLite emit native Drizzle builders and
reject PostgreSQL-only fields.

## The simple case

New applications use PostgreSQL and keep the familiar API:

```ts
import { db } from './db'

const products = await db.select().from(productsTable)
```

`db` is the `primary` connection. Its schema and migrations remain in `src/db/schema/` and
`src/db/migrations/`.

Choose another primary adapter non-interactively:

```sh
bun create bunway tinyapp --database=sqlite
bun create bunway shop --database=mysql
```

## Named databases

```sh
bunway db:add analytics --adapter=postgres
bunway db:add legacy --adapter=mysql
bunway db:add local --adapter=sqlite
bunway db:list
```

Configuration is small and explicit:

```ts
import { defineDatabases } from '@bunway/core'

export default defineDatabases({
  primary: { adapter: 'postgres', url: Bun.env.DATABASE_URL },
  analytics: { adapter: 'postgres', url: Bun.env.ANALYTICS_DATABASE_URL },
  legacy: { adapter: 'mysql', url: Bun.env.LEGACY_DATABASE_URL },
  local: { adapter: 'sqlite', url: './storage/local.sqlite' },
})
```

`src/db/index.ts` exports statically typed clients:

```ts
import { db, analytics, legacy, local } from './db'

const order = await db.select().from(orders)
const metrics = await analytics.select().from(metricsTable)
const oldCustomers = await legacy.select().from(legacyCustomers)
const preferences = await local.select().from(localPreferences)
```

This supports a realistic split: primary PostgreSQL application data, PostgreSQL analytics, an existing
MySQL system, and local SQLite auxiliary data. Credentials are never shown by `db:list`.

## Generators and schemas

Generators target `primary` unless selected:

```sh
bunway g resource Product name:string price:decimal
bunway g model Event name:string payload:json --database=analytics
bunway g resource LegacyCustomer name:string --database=legacy
```

Each SQL database owns its Drizzle schema. Added databases use
`src/db/<name>/schema/` and `src/db/<name>/migrations/`; the primary database keeps the shallow existing
layout. Builders, IDs, and timestamps are emitted for the selected dialect. All three SQL adapters use
`Bun.randomUUIDv7()` for UUID primary keys by default.
PostgreSQL-only fields such
as arrays, `jsonb`, network types, and timezone-specific types fail clearly on other adapters. Advanced
engine-specific types remain handwritten ordinary Drizzle code.

Choose `uuid`, `integer`, or `bigint` with `--id-type`. UUIDs use the standard representation by
default; choose the compact representation with `--id-encoding=base64url`, or set
`BUNWAY_ID_ENCODING=base64url` for generator invocations. Standard UUIDs use PostgreSQL's native
`uuid`; base64url IDs use 22-character text/varchar columns on every SQL adapter. Relationship
generators inherit both the primary-key type and UUID encoding.

Relationships are resolved only inside the selected database. Bunway never creates a cross-database
foreign key. Store an external identifier explicitly when records live in independent databases.

## Migrations

```sh
bunway db:migrate
bunway db:migrate --database=analytics
bunway db:migrate --all
```

Every database has a small Drizzle Kit config (`drizzle.config.ts` for primary and
`drizzle.<name>.config.ts` for additional databases). Bunway generates migration SQL with Drizzle Kit,
applies it with Drizzle ORM and the adapter's native client, reports the name, and stops on failure.
`--all` is sequential and is not presented as a cross-database transaction.
