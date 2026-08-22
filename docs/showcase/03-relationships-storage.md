---
title: 3. Build the publishing showcase
---

# 3. Build the publishing showcase

This step creates the Users, Tags, Posts, and Comments CRUD screens, then composes them into the same
public `/blog` experience used by `bunway-test-app`. Run every command from `showcase/`.

## 1. Generate the resources

Targets must exist before relationships point to them, so run these in order:

```sh
bunway g scaffold User name:string email:string:unique bio:text:optional avatar:image:optional
bunway g scaffold Tag name:string
bunway g scaffold Post title:string slug:string:unique excerpt:text:optional body:text user:belongs_to published:boolean publishedAt:timestamp:optional tags:many_to_many:as=taggable:through=post_taggings cover:image:optional
bunway g scaffold Comment body:text post:belongs_to user:belongs_to approved:boolean
bunway db:migrate
```

The polymorphic modifiers produce `post-taggings.ts` with `taggableType` and `taggableId`, exactly as
the Blog query below expects. Restart `bunway dev`; confirm `/users`, `/tags`, `/posts`, and `/comments`
appear. Create one User and Tag before creating a Post.

:::warning Continuing a showcase created from the earlier tutorial?
The earlier tutorial incorrectly generated Post with the ordinary `tags:many_to_many` relationship,
which created `src/db/schema/posts-to-tags.ts`. That schema cannot demonstrate polymorphism and is not
the canonical publishing showcase described here.

Because this walkthrough is for a disposable demo application, create a fresh showcase and run the
commands above exactly. Before adding Blog code, verify that this file exists:

```text
src/db/schema/post-taggings.ts
```

and that `src/db/schema/index.ts` contains:

```ts
export { postTaggings } from './post-taggings'
```

Do not substitute `postsToTags` in the Blog query: that would make the page work while defeating the
polymorphic example. Ordinary many-to-many remains a separate supported pattern documented in
[Relationships](/relationships#collection-relationships).
:::

## 2. Add nested comments

Open `src/db/schema/comments.ts`. Add the matching column type and builder to its existing Drizzle core
import, then add `parentId` after `userId`.

PostgreSQL:

```ts
parentId: uuid('parentId').references((): AnyPgColumn => comments.id, {
  onDelete: 'cascade',
}),
```

MySQL (`AnyMySqlColumn` and `varchar` come from `drizzle-orm/mysql-core`):

```ts
parentId: varchar('parentId', { length: 36 }).references(
  (): AnyMySqlColumn => comments.id,
  { onDelete: 'cascade' },
),
```

SQLite (`AnySQLiteColumn` and `text` come from `drizzle-orm/sqlite-core`):

```ts
parentId: text('parentId').references((): AnySQLiteColumn => comments.id, {
  onDelete: 'cascade',
}),
```

Add this alongside the generated indexes:

```ts
index('comments_parentId_idx').on(table.parentId),
```

Add these inside `commentsRelations`:

```ts
parent: one(comments, {
  fields: [comments.parentId],
  references: [comments.id],
  relationName: 'thread',
}),
replies: many(comments, { relationName: 'thread' }),
```

Apply it:

```sh
bunway db:migrate
```

The schema edit must also cross the API and UI boundaries. In `src/routes/comments.ts`, add this to
the generated request body after `userId`:

```ts
parentId: t.Optional(t.String()),
```

In `web/src/routes/comments/+page.svelte`, add `parentId: ''` to both initial/reset form objects and
`parentId: record.parentId ?? ''` to `edit`. Add this derived option list beside the User options:

```ts
let parentItems = $derived(
  records
    .filter((record) => record.id !== editing)
    .map((record) => ({ id: record.id, label: record.body })),
)
```

At the start of `save`, create `const values = { ...form, parentId: form.parentId || undefined }` and
send `values` instead of `form`. Add this control after the User picker:

```svelte
<RelationshipCombobox
  label="Parent comment (optional)"
  items={parentItems}
  bind:value={form.parentId}
/>
```

The Comments CRUD can now create a root comment or select any existing Comment as its parent.

## Seed the publishing tables

Run these in order and replace each `PASTE_*_ID` with the `id` returned earlier. These commands seed
every ordinary publishing table; the fifth command attaches the Tag through the polymorphic join:

```sh
curl -X POST http://localhost:3000/users -H "content-type: application/json" -d '{"name":"Ada Lovelace","email":"ada@example.test","bio":"Bunway author"}'
curl -X POST http://localhost:3000/tags -H "content-type: application/json" -d '{"name":"Bun"}'
curl -X POST http://localhost:3000/posts -H "content-type: application/json" -d '{"title":"Welcome to Bunway","slug":"welcome-to-bunway","excerpt":"A fast first post","body":"Built with Bun, Elysia, Drizzle, and SvelteKit.","userId":"PASTE_USER_ID","published":true,"publishedAt":"2026-08-21T12:00:00.000Z"}'
curl -X POST http://localhost:3000/comments -H "content-type: application/json" -d '{"body":"This looks exciting.","postId":"PASTE_POST_ID","userId":"PASTE_USER_ID","approved":true}'
curl -X PUT http://localhost:3000/posts/PASTE_POST_ID/tags -H "content-type: application/json" -d '{"ids":["PASTE_TAG_ID"]}'
curl -X POST http://localhost:3000/comments -H "content-type: application/json" -d '{"body":"A nested reply from curl.","postId":"PASTE_POST_ID","userId":"PASTE_USER_ID","parentId":"PASTE_ROOT_COMMENT_ID","approved":true}'
```

## 3. Create the Blog API

Create `src/routes/blog.ts`:

```ts
import { Elysia } from 'elysia'
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import {
  comments,
  posts,
  storageAttachments,
  storageBlobs,
  tags,
  users,
} from '../db/schema'
import { postTaggings } from '../db/schema/post-taggings'
import { storage } from '../storage'

export const blogRoutes = new Elysia({ prefix: '/blog' }).get('/', async () => {
  const postRows = await db
    .select({ post: posts, authorName: users.name })
    .from(posts)
    .innerJoin(users, eq(posts.userId, users.id))
    .where(eq(posts.published, true))
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))

  const commentRows = await db
    .select({ comment: comments, authorName: users.name })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.approved, true))
    .orderBy(asc(comments.createdAt))

  const tagRows = await db
    .select({ postId: postTaggings.taggableId, id: tags.id, name: tags.name })
    .from(postTaggings)
    .innerJoin(tags, eq(tags.id, postTaggings.tagId))
    .where(eq(postTaggings.taggableType, 'Post'))

  const coverRows = await db
    .select({ postId: storageAttachments.recordId, key: storageBlobs.key })
    .from(storageAttachments)
    .innerJoin(storageBlobs, eq(storageBlobs.id, storageAttachments.blobId))
    .where(
      and(
        eq(storageAttachments.recordType, 'posts'),
        eq(storageAttachments.name, 'cover'),
      ),
    )

  const covers = new Map(
    await Promise.all(
      coverRows.map(
        async (row) => [row.postId, await storage.url(row.key)] as const,
      ),
    ),
  )

  return postRows.map(({ post, authorName }) => ({
    ...post,
    authorName,
    coverUrl: covers.get(post.id) ?? null,
    tags: tagRows
      .filter((tag) => tag.postId === post.id)
      .map(({ id, name }) => ({ id, name })),
    comments: commentRows
      .filter((row) => row.comment.postId === post.id)
      .map(({ comment, authorName }) => ({ ...comment, authorName })),
  }))
})
```

In `src/routes/index.ts`, add the import and `.use(...)` before their marker comments:

```ts
import { blogRoutes } from './blog'
```

```ts
.use(blogRoutes)
```

Restart the server and test the API:

```sh
curl http://localhost:3000/blog
```

An empty `[]` is correct until a published Post exists.

## 4. Create the recursive Comment component

Create `web/src/lib/components/comment-thread.svelte`:

```svelte
<script lang="ts">
  import CommentThread from './comment-thread.svelte'

  export type BlogComment = {
    id: string
    parentId: string | null
    body: string
    authorName: string
    createdAt: string
    replies?: BlogComment[]
  }

  let { comments, onreply }: {
    comments: BlogComment[]
    onreply: (parentId: string, body: string) => Promise<void>
  } = $props()
  let replyingTo = $state<string | null>(null)
  let reply = $state('')

  async function submit(parentId: string) {
    if (!reply.trim()) return
    await onreply(parentId, reply.trim())
    reply = ''
    replyingTo = null
  }
</script>

<div class="space-y-4">
  {#each comments as comment (comment.id)}
    <article class="rounded-xl border border-border/70 bg-background p-4 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
        <strong>{comment.authorName}</strong>
        <time class="text-muted-foreground">{new Date(comment.createdAt).toLocaleString()}</time>
      </div>
      <p class="mt-2 leading-7 text-foreground/85">{comment.body}</p>
      <button class="mt-3 text-sm font-medium text-primary" onclick={() => replyingTo = replyingTo === comment.id ? null : comment.id}>Reply</button>
      {#if replyingTo === comment.id}
        <form class="mt-3 flex gap-2" onsubmit={(event) => { event.preventDefault(); void submit(comment.id) }}>
          <input class="min-w-0 flex-1 rounded-md border px-3 py-2" bind:value={reply} required />
          <button class="rounded-md bg-primary px-3 py-2 text-primary-foreground">Post reply</button>
        </form>
      {/if}
      {#if comment.replies?.length}
        <div class="mt-4 border-l-2 border-primary/25 pl-4">
          <CommentThread comments={comment.replies} {onreply} />
        </div>
      {/if}
    </article>
  {/each}
</div>
```

## 5. Create the Blog page

Create `web/src/routes/blog/+page.svelte` (create the `blog/` directory first):

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { treaty } from '@elysiajs/eden'
  import type { App } from '../../../../src/app'
  import CommentThread, { type BlogComment } from '$lib/components/comment-thread.svelte'

  const api = treaty<App>('http://localhost:3000')
  type BlogPost = {
    id: string
    title: string
    excerpt: string | null
    body: string
    publishedAt: string | null
    authorName: string
    coverUrl: string | null
    tags: { id: string; name: string }[]
    comments: BlogComment[]
  }
  let posts = $state<BlogPost[]>([])
  let users = $state<{ id: string; name: string }[]>([])
  let userId = $state('')
  let message = $state('')

  function formatDate(value: string) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  }

  function thread(comments: BlogComment[]) {
    const nodes = new Map(
      comments.map((comment) => [comment.id, { ...comment, replies: [] as BlogComment[] }]),
    )
    const roots: BlogComment[] = []
    for (const comment of nodes.values()) {
      const parent = comment.parentId ? nodes.get(comment.parentId) : undefined
      if (parent) parent.replies!.push(comment)
      else roots.push(comment)
    }
    return roots
  }

  onMount(async () => {
    const [result, userResult] = await Promise.all([
      api.blog.get(),
      api.users.get({ query: { perPage: 'all' } }),
    ])
    if (result.error) message = 'Could not load the blog'
    else posts = (result.data ?? []) as BlogPost[]
    if (!userResult.error) {
      users = userResult.data?.records ?? []
      userId ||= users[0]?.id ?? ''
    }
  })

  async function reply(postId: string, parentId: string, body: string) {
    if (!userId) { message = 'Create or select a User before replying.'; return }
    const result = await api.comments.post({ body, postId, userId, parentId, approved: true })
    if (result.error) { message = 'Could not post the reply.'; return }
    const refreshed = await api.blog.get()
    if (!refreshed.error) posts = (refreshed.data ?? []) as BlogPost[]
  }
</script>

<svelte:head><title>Bunway Blog Showcase</title></svelte:head>

<main class="w-full min-w-0 px-4 py-10 sm:px-6 lg:px-8">
  <header class="mb-12">
    <p class="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Built from scaffolds</p>
    <h1 class="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">The Bunway Blog</h1>
    <p class="mt-4 text-lg leading-8 text-muted-foreground">
      Generated posts, users, tags, attachments, and comments composed into a public experience.
    </p>
  </header>
  {#if message}<p class="rounded-xl border p-4 text-destructive">{message}</p>{/if}
  <div class="space-y-16">
    {#each posts as post (post.id)}
      <article class="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {#if post.coverUrl}
          <img class="aspect-[16/7] w-full object-cover" src={post.coverUrl} alt={post.title} />
        {/if}
        <div class="p-6 sm:p-8">
          <div class="flex flex-wrap gap-2">
            {#each post.tags as tag}
              <span class="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">{tag.name}</span>
            {/each}
          </div>
          <h2 class="mt-4 text-3xl font-bold">{post.title}</h2>
          <p class="mt-2 text-sm text-muted-foreground">
            By {post.authorName}{#if post.publishedAt} · {formatDate(post.publishedAt)}{/if}
          </p>
          {#if post.excerpt}<p class="mt-5 text-lg text-muted-foreground">{post.excerpt}</p>{/if}
          <p class="mt-5 whitespace-pre-line leading-8">{post.body}</p>
          <section class="mt-10 border-t pt-8">
            <h3 class="mb-5 text-xl font-semibold">Discussion ({post.comments.length})</h3>
            <label class="mb-5 block text-sm">Comment as
              <select class="ml-2 rounded-md border px-3 py-2" bind:value={userId}>
                {#each users as user}<option value={user.id}>{user.name}</option>{/each}
              </select>
            </label>
            {#if post.comments.length}
              <CommentThread comments={thread(post.comments)} onreply={(parentId, body) => reply(post.id, parentId, body)} />
            {:else}
              <p class="text-muted-foreground">No comments yet.</p>
            {/if}
          </section>
        </div>
      </article>
    {:else}
      <p class="rounded-xl border bg-card p-6">Create a published Post to populate the Blog.</p>
    {/each}
  </div>
</main>
```

## 6. Add navigation and verify

Insert this immediately before `// bunway:resources` in `web/src/lib/resources.ts`:

```ts
{ label: 'Blog Showcase', href: '/blog', icon: 'article' },
```

Restart `bunway dev`, open `http://localhost:5173/blog`, and confirm the sidebar link appears. If the
page is empty, open `/posts`, create a Post with `published` enabled, and reload.

Next: [add Jobs and Realtime](./04-jobs-realtime.md).
