# @bunway/cli

The command-line experience for [Bunway](https://djrobby.github.io/bunway/), a lightweight, Rails-inspired full-stack
framework for Bun.

Bunway turns a modern Bun stack into a fast, coherent application workflow:

```text
Bun + Elysia + PostgreSQL + Drizzle + Eden Treaty + SvelteKit + Svelte 5
```

It generates readable application code instead of hiding the underlying tools behind controllers,
repositories, base models, or a proprietary router.

## Installation

```sh
bun add --global @bunway/cli
```

Create an application with `create-bunway`, then use the CLI inside it:

```sh
bun create bunway shop
cd shop

bunway g scaffold Product name:string price:decimal active:boolean
bunway db:migrate
bunway dev
```

Drizzle Kit generates PostgreSQL migration SQL, and Drizzle ORM applies it through Bun.SQL. Neither
`pg` nor Postgres.js is required by Bunway migration commands.
MySQL and SQLite use the same generated migration files with Drizzle's `mysql2` and `bun:sqlite`
migrators respectively.

## Essential commands

```sh
bunway dev
bunway routes
bunway console
bunway --version

bunway g model User email:string:unique
bunway g resource Customer name:string email:string
bunway g scaffold Product name:string price:decimal
bunway g job ImportProducts

bunway db:migrate
bunway worker
```

Generators produce ordinary Drizzle schemas, composable Elysia routes, Bun tests, and SvelteKit pages.
Everything is intended to be opened, read, and changed.

## What Bunway configures

- PostgreSQL with Drizzle and Bun.SQL by default
- validated Elysia APIs with Eden Treaty inference
- SvelteKit 2, Svelte 5, Tailwind CSS, and shadcn-svelte
- PostgreSQL-backed jobs without Redis, with an in-memory driver when no database is configured
- optional Realtime, Auth, Audit, Messaging, and Storage generators

Run `bunway help` for the complete command summary or visit the
[Bunway documentation](https://djrobby.github.io/bunway/).
