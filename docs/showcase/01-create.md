---
title: 1. Create and understand the app
---

# 1. Create and understand the app

We use PostgreSQL because Jobs require its locking semantics.

```sh
bun create bunway showcase
cd showcase
cp .env.example .env
```

Create a database and set `DATABASE_URL`, for example:

```dotenv
DATABASE_URL=postgres://postgres:postgres@localhost:5432/bunway_showcase
```

```sh
bunway db:migrate
bunway dev
```

The API starts on 3000 and SvelteKit normally on 5173. Read `src/app.ts` (Elysia HTTP composition),
`src/db/index.ts` (Drizzle), and `web/src/routes/+page.svelte` (SvelteKit). Bunway supplied conventions
and generated source, not replacement layers.

:::tip Verify it
Open both local origins and run `bunway routes`.
:::

Next: [generate the first resource](./02-resource.md).
