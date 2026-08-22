---
title: PostgreSQL adapter
---

# PostgreSQL adapter

PostgreSQL is Bunway's default and uses Drizzle's `bun-sql` driver over Bun.SQL. `DATABASE_URL` configures
primary; named connections conventionally use `<NAME>_DATABASE_URL`.

Generated UUID IDs use Drizzle's application default with Bun's native `Bun.randomUUIDv7()`. PostgreSQL
stores the result in its ordinary `uuid` type, so UUIDv7 does not impose a PostgreSQL 18 requirement.
Integer and bigint use `serial` and `bigserial`. Timestamps use native PostgreSQL timestamps with
database defaults. Generators support the
widest field set, including arrays, JSONB, inet/cidr/macaddr, interval, and timezone-aware timestamps.
Other PostgreSQL-specific builders remain directly available from `drizzle-orm/pg-core`.

Use the exported Drizzle connection for normal application work. `new Bun.SQL(url)` remains available
for direct parameterized PostgreSQL SQL. Bunway Jobs require PostgreSQL and use `primary` by default.
