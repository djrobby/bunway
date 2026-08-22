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
bunway g scaffold Post title:string slug:string:unique excerpt:text:optional body:text user:belongs_to published:boolean publishedAt:timestamptz:optional tags:many_to_many:as=taggable:through=post_taggings cover:image:optional
bunway g scaffold Comment body:text post:belongs_to user:belongs_to approved:boolean
bunway db:migrate
```

The polymorphic modifiers produce `post-taggings.ts` with `taggableType` and `taggableId`, exactly as
the Blog query below expects. Restart `bunway dev`; confirm `/users`, `/tags`, `/posts`, and `/comments`
appear. Create one User and Tag before creating a Post.

## 2. Add nested comments

Open `src/db/schema/comments.ts`. Add `type AnyPgColumn` to the import from
`drizzle-orm/pg-core`, then add this field after `userId`:

```ts
parentId: uuid('parentId').references((): AnyPgColumn => comments.id, {
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
      coverRows.map(async (row) => [row.postId, await storage.url(row.key)] as const),
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

  let { comments }: { comments: BlogComment[] } = $props()
</script>

<div class="space-y-4">
  {#each comments as comment (comment.id)}
    <article class="rounded-xl border border-border/70 bg-background p-4 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
        <strong>{comment.authorName}</strong>
        <time class="text-muted-foreground">{new Date(comment.createdAt).toLocaleString()}</time>
      </div>
      <p class="mt-2 leading-7 text-foreground/85">{comment.body}</p>
      {#if comment.replies?.length}
        <div class="mt-4 border-l-2 border-primary/25 pl-4">
          <CommentThread comments={comment.replies} />
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
    const result = await api.blog.get()
    if (result.error) message = 'Could not load the blog'
    else posts = (result.data ?? []) as BlogPost[]
  })
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
            {#if post.comments.length}
              <CommentThread comments={thread(post.comments)} />
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
