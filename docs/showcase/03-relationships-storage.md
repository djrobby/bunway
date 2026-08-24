---
title: 3. Build the publishing showcase
---

# 3. Build the publishing showcase

This step creates the Users, Tags, Posts, and Comments CRUD screens, then composes them into the same
public `/blog` experience in the [finished Showcase](./index.md). Run every command from `showcase/`.

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

Before adding Blog code, verify that this file exists:

```text
src/db/schema/post-taggings.ts
```

and that `src/db/schema/index.ts` contains:

```ts
export { postTaggings } from './post-taggings'
```

The Blog query deliberately uses `postTaggings` to demonstrate polymorphism. Ordinary many-to-many
remains a separate supported pattern documented in [Relationships](/relationships#collection-relationships).

## 2. Add nested comments

Open `src/db/schema/comments.ts`. The generated column section starts like this:

```ts title="Before: comments table"
userId: uuid('userId')
  .notNull()
  .references(() => users.id),
approved: boolean('approved').notNull().default(false),
```

Change that focused section to the matching version for your database.

PostgreSQL (also add `type AnyPgColumn` to the existing `drizzle-orm/pg-core` import):

```ts title="After: PostgreSQL"
userId: uuid('userId')
  .notNull()
  .references(() => users.id),
parentId: uuid('parentId').references((): AnyPgColumn => comments.id, {
  onDelete: 'cascade',
}),
approved: boolean('approved').notNull().default(false),
```

MySQL (also add `type AnyMySqlColumn` to the existing `drizzle-orm/mysql-core` import):

```ts title="After: MySQL"
userId: varchar('userId', { length: 36 })
  .notNull()
  .references(() => users.id),
parentId: varchar('parentId', { length: 36 }).references(
  (): AnyMySqlColumn => comments.id,
  { onDelete: 'cascade' },
),
approved: boolean('approved').notNull().default(false),
```

SQLite (also add `type AnySQLiteColumn` to the existing `drizzle-orm/sqlite-core` import):

```ts title="After: SQLite"
userId: text('userId')
  .notNull()
  .references(() => users.id),
parentId: text('parentId').references((): AnySQLiteColumn => comments.id, {
  onDelete: 'cascade',
}),
approved: integer('approved', { mode: 'boolean' }).notNull().default(false),
```

The end of the generated index list looks like this:

```ts title="Before: indexes"
index('comments_userId_idx').on(table.userId),
```

Change it to:

```ts title="After: indexes"
index('comments_userId_idx').on(table.userId),
index('comments_parentId_idx').on(table.parentId),
```

The generated relations end with the User relation:

```ts title="Before: relations"
user: one(users, { fields: [comments.userId], references: [users.id] }),
```

Change that ending to:

```ts title="After: relations"
user: one(users, { fields: [comments.userId], references: [users.id] }),
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

The schema edit must also cross the API and UI boundaries. In `src/routes/comments.ts`, find:

```ts title="Before: request body"
userId: t.String(),
approved: t.Boolean(),
```

Change it to:

```ts title="After: request body"
userId: t.String(),
parentId: t.Optional(t.String()),
approved: t.Boolean(),
```

In `web/src/routes/comments/+page.svelte`, make these four focused changes.

```ts title="Before: form state"
let form = $state({ body: '', postId: '', userId: '', approved: false })
```

```ts title="After: form state"
let form = $state({
  body: '',
  postId: '',
  userId: '',
  parentId: '',
  approved: false,
})
```

Find the User option state:

```ts title="Before: option state"
let userItems = $derived(
  userOptions.map((option) => ({ id: option.id, label: label(option) })),
)
```

Change it to:

```ts title="After: option state"
let userItems = $derived(
  userOptions.map((option) => ({ id: option.id, label: label(option) })),
)
let parentItems = $derived(
  records
    .filter((record) => record.id !== editing)
    .map((record) => ({ id: record.id, label: record.body })),
)
```

Replace the complete generated `save` function:

```ts title="Before: save"
async function save(event: SubmitEvent) {
  event.preventDefault()
  const result =
    editing === null
      ? await api.comments.post(form)
      : await api.comments({ id: editing }).patch(form)
  if (result.error || !result.data)
    message = errorMessage(result.error, 'Could not save comment')
  else {
    cancel()
    await load()
  }
}
```

```ts title="After: save"
async function save(event: SubmitEvent) {
  event.preventDefault()
  const values = { ...form, parentId: form.parentId || undefined }
  const result =
    editing === null
      ? await api.comments.post(values)
      : await api.comments({ id: editing }).patch(values)
  if (result.error || !result.data)
    message = errorMessage(result.error, 'Could not save comment')
  else {
    cancel()
    await load()
  }
}
```

In `edit`, change this focused section:

```ts title="Before: edit"
userId: record.userId,
approved: record.approved,
```

Then update the reset inside `cancel`:

```ts title="Before: cancel"
form = { body: '', postId: '', userId: '', approved: false }
```

```ts title="After: cancel"
form = { body: '', postId: '', userId: '', parentId: '', approved: false }
```

```ts title="After: edit"
userId: record.userId,
parentId: record.parentId ?? '',
approved: record.approved,
```

Finally, find the generated User picker:

```svelte title="Before: form controls"
<RelationshipCombobox label="User" items={userItems} bind:value={form.userId} oncreate={createUser} />
```

Change it to:

```svelte title="After: form controls"
<RelationshipCombobox label="User" items={userItems} bind:value={form.userId} oncreate={createUser} />
<RelationshipCombobox
  label="Parent comment (optional)"
  items={parentItems}
  bind:value={form.parentId}
/>
```

The Comments CRUD can now create a root comment or select any existing Comment as its parent.

## Seed the publishing tables

Copy and paste the complete block for your shell. Both versions capture every returned ID, create a
Post, attach its Tag, then create a root Comment and a nested reply without placeholders.

### macOS, Linux, Git Bash, or WSL

```sh
set -e
USER_ID=$(curl --silent --fail-with-body --request POST http://localhost:3000/users --header 'content-type: application/json' --data-raw '{"name":"Grace Hopper","email":"grace@example.test","bio":"Bunway author"}' | bun -e 'console.log(JSON.parse(await Bun.stdin.text()).id)')
TAG_ID=$(curl --silent --fail-with-body --request POST http://localhost:3000/tags --header 'content-type: application/json' --data-raw '{"name":"Bun"}' | bun -e 'console.log(JSON.parse(await Bun.stdin.text()).id)')
POST_ID=$(curl --silent --fail-with-body --request POST http://localhost:3000/posts --header 'content-type: application/json' --data-raw "{\"title\":\"Welcome to Bunway\",\"slug\":\"welcome-to-bunway-bash\",\"excerpt\":\"A fast first post\",\"body\":\"Built with Bun, Elysia, Drizzle, and SvelteKit.\",\"userId\":\"$USER_ID\",\"published\":true,\"publishedAt\":\"2026-08-21T12:00:00.000Z\"}" | bun -e 'console.log(JSON.parse(await Bun.stdin.text()).id)')
curl --silent --fail-with-body --request PUT "http://localhost:3000/posts/$POST_ID/tags" --header 'content-type: application/json' --data-raw "{\"ids\":[\"$TAG_ID\"]}"
ROOT_COMMENT_ID=$(curl --silent --fail-with-body --request POST http://localhost:3000/comments --header 'content-type: application/json' --data-raw "{\"body\":\"This looks exciting.\",\"postId\":\"$POST_ID\",\"userId\":\"$USER_ID\",\"approved\":true}" | bun -e 'console.log(JSON.parse(await Bun.stdin.text()).id)')
curl --silent --fail-with-body --request POST http://localhost:3000/comments --header 'content-type: application/json' --data-raw "{\"body\":\"A nested reply from curl.\",\"postId\":\"$POST_ID\",\"userId\":\"$USER_ID\",\"parentId\":\"$ROOT_COMMENT_ID\",\"approved\":true}"
```

### Windows PowerShell

```powershell
$ErrorActionPreference = "Stop"
$user = (curl.exe --silent --fail-with-body --request POST http://localhost:3000/users --header "content-type: application/json" --data-raw '{"name":"Ada Lovelace","email":"ada@example.test","bio":"Bunway author"}') | ConvertFrom-Json
$tag = (curl.exe --silent --fail-with-body --request POST http://localhost:3000/tags --header "content-type: application/json" --data-raw '{"name":"Bun"}') | ConvertFrom-Json
$postBody = @{ title = "Welcome to Bunway"; slug = "welcome-to-bunway"; excerpt = "A fast first post"; body = "Built with Bun, Elysia, Drizzle, and SvelteKit."; userId = $user.id; published = $true; publishedAt = "2026-08-21T12:00:00.000Z" } | ConvertTo-Json -Compress
$post = (curl.exe --silent --fail-with-body --request POST http://localhost:3000/posts --header "content-type: application/json" --data-raw $postBody) | ConvertFrom-Json
$tagBody = @{ ids = @($tag.id) } | ConvertTo-Json -Compress
curl.exe --silent --fail-with-body --request PUT "http://localhost:3000/posts/$($post.id)/tags" --header "content-type: application/json" --data-raw $tagBody
$commentBody = @{ body = "This looks exciting."; postId = $post.id; userId = $user.id; approved = $true } | ConvertTo-Json -Compress
$rootComment = (curl.exe --silent --fail-with-body --request POST http://localhost:3000/comments --header "content-type: application/json" --data-raw $commentBody) | ConvertFrom-Json
$replyBody = @{ body = "A nested reply from curl."; postId = $post.id; userId = $user.id; parentId = $rootComment.id; approved = $true } | ConvertTo-Json -Compress
curl.exe --silent --fail-with-body --request POST http://localhost:3000/comments --header "content-type: application/json" --data-raw $replyBody
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

In `src/routes/index.ts`, insert this line immediately before `// bunway:imports`:

```ts
import { blogRoutes } from './blog'
```

Then insert this line immediately before `// bunway:routes`:

```ts
.use(blogRoutes)
```

Restart the server and test the API on macOS/Linux:

```sh
curl http://localhost:3000/blog
```

On Windows PowerShell:

```powershell
curl.exe http://localhost:3000/blog
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

In `web/src/lib/resources.ts`, insert this entry immediately before `// bunway:resources`:

```ts
{ label: 'Blog Showcase', href: '/blog', icon: 'article' },
```

Restart `bunway dev`, open `http://localhost:5173/blog`, and confirm the sidebar link appears. If the
page is empty, open `/posts`, create a Post with `published` enabled, and reload.

Next: [add Mail and SMS](./06-audit-messaging.md).
