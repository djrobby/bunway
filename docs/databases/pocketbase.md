---
title: PocketBase adapter
---

# PocketBase adapter

PocketBase is supported as a named native client, not as a Drizzle engine. Bunway installs the official
`pocketbase` JavaScript SDK and exports `new PocketBase(url)` from `src/db/index.ts`:

```ts
import { content } from './db'

const articles = await content.collection('articles').getList()
```

PocketBase collections are backed by its embedded SQLite database but are managed through PocketBase's
collection API, dashboard, and `pb_migrations`. Bunway therefore does not generate Drizzle schemas,
Drizzle configs, SQL relationships, or CRUD resources for this adapter. This explicit difference avoids
an inaccurate lowest-common-denominator database API.

PocketBase owns a required 15-character system record ID, so it cannot use a standard 36-character
UUIDv7 as its primary key. Applications that need a shared UUIDv7 identifier may add a separate unique
text field while retaining PocketBase's native `id` for records and relations.

Run PocketBase migrations with its executable, for example
`pocketbase migrate up --migrationsDir=src/db/content/pb_migrations`. PocketBase is not eligible for the
PostgreSQL-backed Bunway Jobs queue.
