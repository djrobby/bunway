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

## Amazon S3

Create an S3 bucket and an IAM access key allowed to read, write, and delete objects in that bucket.
For a bucket named `my-bunway-files` in `us-east-1`, configure:

```env
STORAGE_SERVICE=s3
STORAGE_BUCKET=my-bunway-files
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=AKIA_REPLACE_ME
STORAGE_SECRET_ACCESS_KEY=replace-me
STORAGE_PUBLIC_URL=https://my-bunway-files.s3.us-east-1.amazonaws.com
```

Do not set `STORAGE_ENDPOINT` for AWS S3. If the bucket is private, `STORAGE_PUBLIC_URL` must point to
the CDN or application URL that is allowed to serve those objects.

## Cloudflare R2

In Cloudflare, create an R2 bucket, create an R2 API token with object read/write permission, and copy
the account ID, access-key ID, and secret. For a bucket named `my-bunway-files`, configure:

```env
STORAGE_SERVICE=s3
STORAGE_BUCKET=my-bunway-files
STORAGE_REGION=auto
STORAGE_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY_ID=replace-with-r2-access-key-id
STORAGE_SECRET_ACCESS_KEY=replace-with-r2-secret-access-key
STORAGE_PUBLIC_URL=https://files.example.com
```

`STORAGE_PUBLIC_URL` is the R2 custom domain or public development URL configured for the bucket; it is
not the S3 API endpoint. Both setups use Bun's native S3-compatible client. The attachment API remains
the same for local storage, S3, and R2.

Scaffold tables show attachment counts in a dedicated badge. Clicking opens previews and removal
controls; a steady filled badge uses fading outward rings to indicate attached files.
