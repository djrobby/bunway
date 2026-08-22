---
title: 3. Add relationships and attachments
---

# 3. Add relationships and attachments

Generate related resources first so Bunway can inspect their IDs.

```sh
bunway g scaffold Category name:string:unique
bunway g scaffold Listing title:string category:belongs_to image:image:optional gallery:files:optional
bunway db:migrate
```

`belongs_to` creates indexed foreign keys and Drizzle relations. Attachments use `storage_blobs` and
`storage_attachments`; object bytes use `src/storage.ts`.

```dotenv
STORAGE_SERVICE=local
STORAGE_PATH=storage
STORAGE_PUBLIC_URL=http://localhost:3000/storage
```

:::tip Verify it
Create a Category, then a Listing with an image. Follow related links and preview/remove the
file. Confirm bytes under `storage/` and metadata in `storage_blobs`.
:::

For production validation and S3/R2, see [File attachments](../storage.md). Next:
[add Jobs and Realtime](./04-jobs-realtime.md).
