---
title: MySQL adapter
---

# MySQL adapter

MySQL uses Drizzle's officially supported `mysql2` driver. Bunway adds `mysql2` when MySQL is selected or
added. Bun.SQL can execute direct MySQL SQL, but current Drizzle uses `mysql2`; Bunway does not claim the
two drivers are interchangeable.
Drizzle Kit generates migration SQL and Bunway applies it through Drizzle ORM's `mysql2` migrator so
database errors remain visible.

Generated UUID IDs are 36-character UUIDv7 values populated with `Bun.randomUUIDv7()`. Integer and
bigint IDs are unsigned auto-incrementing columns. Generated timestamps use MySQL timestamps with database
defaults. CRUD generation accounts for MySQL's lack of PostgreSQL-style `RETURNING`.

PostgreSQL-only arrays, JSONB, network, interval, and timestamptz generator types are rejected. Use
ordinary `drizzle-orm/mysql-core` builders for MySQL-specific columns and indexes. Bunway Jobs cannot use
a MySQL connection.

The Showcase runs on a MySQL primary except for durable Jobs, workers, and queued Messaging; use the
immediate Job handler and Messaging paths documented by the guide.
