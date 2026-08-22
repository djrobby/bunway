---
title: SQLite adapter
---

# SQLite adapter

SQLite is a first-class primary or named database and uses Drizzle's Bun-native `bun-sqlite` driver. A
new SQLite application defaults to `./storage/development.sqlite`; named databases default to
`./storage/<name>.sqlite` and need no server or credential variable.
Drizzle Kit generates migration SQL and Bunway applies it through Drizzle ORM's Bun-native
`bun:sqlite` migrator.

Generated UUID IDs are text populated with `Bun.randomUUIDv7()`. Integer IDs use SQLite's
auto-incrementing integer primary key. Because SQLite's integer primary key is already 64-bit, the
generator rejects `--id-type=bigint` and asks for integer or UUID. Timestamps are ISO text values.

Use `bun:sqlite` directly for lower-level access. Bun.SQL also supports SQLite, but Drizzle's documented
Bun integration uses `bun:sqlite`. PostgreSQL-only generator fields and Bunway Jobs are unavailable.
The Showcase runs on SQLite except for durable Jobs, workers, and queued Messaging.
