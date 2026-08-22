---
title: 3. Add the publishing model
---

# 3. Add the publishing model

Product already demonstrates a relationship and attachment. Now add the publishing resources used by
the real test app. Generate relationship targets first so Bunway can inspect their IDs.

```sh
bunway g scaffold User name:string email:string:unique bio:text:optional avatar:image:optional
bunway g scaffold Tag name:string
bunway g scaffold Post title:string slug:string:unique excerpt:text:optional body:text user:belongs_to published:boolean publishedAt:timestamptz:optional tags:many_to_many cover:image:optional
bunway g scaffold Comment body:text post:belongs_to user:belongs_to approved:boolean
bunway db:migrate
```

These scaffolds produce the Users, Tags, Posts, and Comments CRUD pages and sidebar links found in the
test app. `belongs_to` creates indexed foreign keys and Drizzle relations; `many_to_many` creates an
explicit junction and association endpoints. Attachments use the storage schemas and `src/storage.ts`.

```dotenv
STORAGE_SERVICE=local
STORAGE_PATH=storage
STORAGE_PUBLIC_URL=http://localhost:3000/storage
```

:::tip Verify it
Create a User and Tags, then a Post and Comment. Exercise the relationship pickers and attachment
preview/removal. Confirm bytes under `storage/`, metadata in `storage_blobs`, and all resource links in
the sidebar.

To match the test app's editorial view, create `src/routes/blog.ts` as an ordinary Elysia GET route
which selects Posts with their User, Tags, and Comments using Drizzle. Register it explicitly from
`src/routes/index.ts`. Render that response from `web/src/routes/blog/+page.svelte`, grouping Comments
by `parentId` for the nested discussion, and add this before `// bunway:resources`:

```ts
{ label: 'Blog Showcase', href: '/blog', icon: 'article' },
```

`/blog` is a composed read experience over the generated schemas, not another resource model.
:::

For production validation and S3/R2, see [File attachments](../storage.md). Next:
[add Jobs and Realtime](./04-jobs-realtime.md).
