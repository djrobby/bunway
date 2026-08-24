---
title: 2. Build Category and Product CRUD
---

# 2. Build Category and Product CRUD

Generate Category first because Product references it. This is also where the [finished Showcase](./index.md) adds
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

Seed both tables by copying the complete block for your shell. Each version captures the Category ID
and uses it in the Product request automatically.

### macOS, Linux, Git Bash, or WSL

Bun extracts the returned ID, so no additional JSON utility is required:

```sh
set -e
CATEGORY_ID=$(curl --silent --fail-with-body --request POST http://localhost:3000/categories --header 'content-type: application/json' --data-raw '{"name":"Hardware"}' | bun -e 'console.log(JSON.parse(await Bun.stdin.text()).id)')
curl --silent --fail-with-body --request POST http://localhost:3000/products --header 'content-type: application/json' --data-raw "{\"name\":\"Mechanical Keyboard\",\"price\":\"129.99\",\"active\":true,\"categoryId\":\"$CATEGORY_ID\"}"
```

### Windows PowerShell

```powershell
$ErrorActionPreference = "Stop"
$categoryJson = curl.exe --silent --fail-with-body --request POST http://localhost:3000/categories --header "content-type: application/json" --data-raw '{"name":"Hardware"}'
$category = $categoryJson | ConvertFrom-Json
$productBody = @{ name = "Mechanical Keyboard"; price = "129.99"; active = $true; categoryId = $category.id } | ConvertTo-Json -Compress
curl.exe --silent --fail-with-body --request POST http://localhost:3000/products --header "content-type: application/json" --data-raw $productBody
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
