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

Seed both tables from another terminal. Copy the Category `id` from the first response into the second
command (use `curl.exe` instead of `curl` in Windows PowerShell):

```sh
curl -X POST http://localhost:3000/categories -H "content-type: application/json" -d '{"name":"Hardware"}'
curl -X POST http://localhost:3000/products -H "content-type: application/json" -d '{"name":"Mechanical Keyboard","price":"129.99","active":true,"categoryId":"PASTE_CATEGORY_ID"}'
```

:::tip Verify it
Open `/categories`, create a category, then open `/products`. Create, edit, inspect, upload an image for,
and delete a product. Confirm both sidebar links and inspect `web/src/lib/resources.ts`.

Use this exact sequence so the Product relationship has a valid target:

1. Open `http://localhost:5173/categories` and select **New Category**.
2. Enter `Hardware`, save it, and confirm it appears in the table.
3. Open `/products`, select **New Product**, and enter `Mechanical Keyboard`, `129.99`, enabled, and
   Category `Hardware`.
4. Save, open the Product detail page, upload an image, and reload to confirm attachment persistence.
5. Edit the price, return to the table, and use Delete to verify the destructive confirmation dialog.
   :::

Next: [add relationships and attachments](./03-relationships-storage.md).
