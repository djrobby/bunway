---
slug: /
sidebar_position: 1
title: Bunway
---

# Rails-like productivity. Ordinary Bun code.

Bunway is a small, Rails-inspired productivity layer for Bun. It generates readable applications made
from Elysia, PostgreSQL by default (with MySQL, SQLite, and PocketBase options), Drizzle ORM, Eden
Treaty, SvelteKit, Svelte 5, Tailwind CSS, and
shadcn-svelte. Bunway does not replace those tools or hide them behind controllers, repositories, or a
custom ORM.

```sh
bun create bunway shop
cd shop
bunway g scaffold Product name:string price:decimal active:boolean image:image:optional
bunway db:migrate
bunway dev
```

The result includes a validated Elysia API, Drizzle schema and migration workflow, typed Eden client,
responsive CRUD interface, filtering, sorting, pagination, configurable columns, and attachment support.

## What Bunway provides

- Project creation and a coordinated development server.
- An application-aware `bunway console` / `bunway c` powered by Bun's native REPL.
- Model, resource, scaffold, and job generators.
- PostgreSQL and Drizzle Kit conventions without a second persistence layer.
- Searchable relationship controls for one-to-one, one-to-many, many-to-many, and explicit polymorphic associations.
- Local and S3-compatible file storage backed by Drizzle attachment metadata.
- PostgreSQL-backed background jobs and concurrent workers.
- SvelteKit CRUD pages composed from source-installed shadcn-svelte components.

## Why Bunway instead of assembling the stack yourself?

The underlying tools provide excellent primitives. Bunway supplies the missing product workflow:
coherent project creation, explicit registrations, database-aware generators, full-stack scaffolds,
durable jobs, integrated development defaults, and production conventions. It removes repetitive setup
without making application behavior harder to trace.

**Bunway generates ordinary application code. You own it. Edit it.** Use Elysia directly for HTTP,
Drizzle or Bun.SQL directly for data, Eden for inferred clients, and SvelteKit directly for frontend
behavior.

Bunway intentionally has no ORM, controller base class, repository pattern, dependency injection
container, proprietary frontend, or RPC protocol.

## Choose your path

- **Learn:** [Getting started](./getting-started.md) and [Create your first app](./first-app.md).
- **Build:** choose a capability in the sidebar or build the complete [Showcase](./showcase/index.md).
- **Reference:** use [CLI](./cli.md), [Generators](./generators.md), [field types](./database-types.md), and
  [configuration](./configuration.md).
