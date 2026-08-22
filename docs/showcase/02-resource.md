---
title: 2. Build Product CRUD
---

# 2. Build Product CRUD

```sh
bunway g scaffold Product name:string price:decimal active:boolean
bunway db:migrate
bunway dev
```

The generator creates `src/db/schema/products.ts`, `src/routes/products.ts`, a Bun smoke test,
SvelteKit list/detail pages, and explicit registrations. Elysia validates bodies, Drizzle queries data,
and Eden Treaty infers the client contract.

:::tip Verify it
Open `http://localhost:5173/products`. Create, edit, inspect, and delete a product. Run `bunway routes`
and confirm five CRUD routes. Inspect the generated files: this is application code you own.
:::

Next: [add relationships and attachments](./03-relationships-storage.md).
