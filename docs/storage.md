---
sidebar_position: 7
title: File attachments
---

# File attachments

Attachment definitions never add URLs, object keys, or storage-provider columns to resource tables.
Drizzle owns metadata in framework schemas:

- `storage_blobs` describes file objects.
- `storage_attachments` connects blobs to records using `recordType`, text-normalized `recordId`, and
  attachment name. Text normalization supports both UUID and numeric application primary keys.

The storage adapter manages object bytes only.

## Generate attachments

```sh
bunway g scaffold Product name:string image:image:optional manual:file:optional photos:files:optional
```

`image` accepts image MIME types, `file` is singular, and `files` supports multiple objects. Generated
multipart routes convert browser `File` values into `UploadedFile` before attaching them.

## Model API

Generated hydrators add handles to ordinary Drizzle rows:

```ts
const product = hydrateProduct(row)
await product.image.attach(file)
await product.image.url()
await product.image.detach()
await product.image.purge()
```

Multiple attachments additionally expose collection operations and per-blob removal. `detach` removes
the database relationship while retaining the blob; `purge` removes the relationship, unreferenced blob
metadata, and physical object.

## Local development

Local storage writes beneath `storage/`. Configure an absolute public URL when the frontend and API use
different origins:

```env
STORAGE_SERVICE=local
STORAGE_PUBLIC_URL=http://localhost:3000/storage
```

## S3 and R2

```env
STORAGE_SERVICE=s3
STORAGE_BUCKET=my-bucket
STORAGE_REGION=auto
STORAGE_ENDPOINT=https://ACCOUNT.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
STORAGE_PUBLIC_URL=https://files.example.com
```

The S3-compatible adapter uses Bun's native S3 support. The attachment API is independent of the
adapter, leaving room for future presigned direct uploads without changing model-facing code.

Scaffold tables show attachment counts in a dedicated badge. Clicking opens previews and removal
controls; a steady filled badge uses fading outward rings to indicate attached files.
