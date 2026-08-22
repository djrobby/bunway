---
title: Create your first app
---

# Create your first app

This ten-minute path creates a real database-backed screen, not a toy endpoint.

## 1. Create and configure it

```sh
bun create bunway shop
cd shop
cp .env.example .env
```

The creator installs dependencies unless you pass `--no-install`. PostgreSQL is the default. Set
`DATABASE_URL` in `.env`; or begin with `--database=sqlite` to use `storage/development.sqlite` without
a database server.

## 2. Generate a full-stack resource

```sh
bunway g scaffold Product name:string price:decimal active:boolean
bunway db:migrate
```

`scaffold` writes an ordinary Drizzle schema, validated Elysia routes, a Bun smoke test, SvelteKit list
and detail pages, and explicit registration edits. It does not generate controllers or repositories.

## 3. Run it

```sh
bunway dev
```

Open `http://localhost:5173/products`. Create, edit, inspect, and delete a product. The API is at
`http://localhost:3000/products`.

When `/products` opens, SvelteKit renders the generated page and its Eden Treaty client requests the
Elysia API. Elysia validates the request, the route queries PostgreSQL through Drizzle and Bun.SQL, and
the typed response updates Svelte state and the browser DOM. There is no Bunway controller, repository,
or renderer in between. The next guide traces every stage, including mutations, attachments, Jobs, and
Realtime.

:::tip Verify it
Run `bunway routes` and confirm the five `/products` CRUD routes. Open
`src/db/schema/products.ts` and `src/routes/products.ts`: this is application code you own and should edit.
:::

Next, build the full mental model in [How a Bunway request works](./request-lifecycle.md), then learn the
[project structure](./project-structure.md), continue with the
[Showcase tutorial](./showcase/index.md), or use [Resources and scaffolding](./scaffolding.md) as a
working reference.
