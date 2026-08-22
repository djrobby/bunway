---
title: 2. Build Category and Product CRUD
---

# 2. Build Category and Product CRUD

Generate Category first because Product references it. This is also where the maintained test app adds
its Product attachment; there is no extra resource introduced later.

```sh
bunway g scaffold Category name:string
bunway g scaffold Product name:string price:decimal active:boolean category:belongs_to image:image:optional
bunway db:migrate
bunway dev
```

The generators create both schemas, routes, Bun smoke tests, SvelteKit list/detail pages, explicit API
registrations, and Categories/Products sidebar entries. Product's relationship is an indexed Drizzle
foreign key. Its image uses the storage schemas rather than a `products` column.

:::tip Verify it
Open `/categories`, create a category, then open `/products`. Create, edit, inspect, upload an image for,
and delete a product. Confirm both sidebar links and inspect `web/src/lib/resources.ts`.
:::

Next: [add relationships and attachments](./03-relationships-storage.md).
