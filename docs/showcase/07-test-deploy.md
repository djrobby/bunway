---
title: 7. Test, build, and deploy
---

# 7. Test, build, and deploy

## 1. Add repeatable showcase data

The CRUD pages work with manual data, but a seed makes a fresh checkout immediately recognizable.
Create `src/db/seed.ts`:

```ts
import { db } from './index'
import { categories, comments, postTaggings, posts, products, tags, users } from './schema'

const [category] = await db
  .insert(categories)
  .values({ name: 'Hardware' })
  .returning()

await db.insert(products).values({
  name: 'Mechanical Keyboard',
  price: '129.99',
  active: true,
  categoryId: category.id,
})

const [author] = await db
  .insert(users)
  .values({
    name: 'Bunway Author',
    email: `author-${crypto.randomUUID()}@example.test`,
    bio: 'Writes about building direct, Bun-native applications.',
  })
  .returning()

const [tag] = await db.insert(tags).values({ name: 'Bun' }).returning()

const [post] = await db
  .insert(posts)
  .values({
    title: 'Building with Bunway',
    slug: `building-with-bunway-${crypto.randomUUID()}`,
    excerpt: 'A generated application remains ordinary Bun, Elysia, Drizzle, and SvelteKit.',
    body: 'Bunway supplies conventions and readable source code without hiding the underlying stack.',
    userId: author.id,
    published: true,
    publishedAt: new Date().toISOString(),
  })
  .returning()

await db.insert(postTaggings).values({
  tagId: tag.id,
  taggableType: 'Post',
  taggableId: post.id,
})

const [root] = await db
  .insert(comments)
  .values({
    body: 'The generated source is easy to follow.',
    postId: post.id,
    userId: author.id,
    approved: true,
  })
  .returning()

await db.insert(comments).values({
  body: 'And nested discussions are still ordinary relational data.',
  postId: post.id,
  userId: author.id,
  parentId: root.id,
  approved: true,
})

console.log('Showcase seed complete')
```

Add this script to the root `package.json` `scripts` object:

```json
"db:seed": "bun src/db/seed.ts"
```

Run it once against an empty database:

```sh
bun run db:seed
```

The values are intentionally unique where required, but this is a fresh-database seed rather than an
idempotent production task. Do not run it repeatedly against the same database.

## 2. Run automated verification

```sh
bun test
bun run typecheck
bun run build
bunway routes
```

All four commands must exit with status 0. `bunway routes` must include `/blog`,
`/realtime/showcase/*`, `/examples/audit/*`, `/examples/messaging/*`, Auth, Storage, and every generated
CRUD route.

## 3. Run the browser verification

Exercise CRUD, upload/download, a queued job, same-process progress, WebSocket chat, password sign-in,
TOTP, an Audit query, immediate console delivery, and queued console delivery. OAuth requires real
credentials.

Use this exact checklist:

1. `/categories` and `/products`: create/edit/delete and upload a Product image.
2. `/users`, `/tags`, `/posts`, `/comments`: confirm relationship pickers and generated detail pages.
3. `/blog`: confirm the seeded Post, Tag, root Comment, and nested reply render.
4. `/realtime`: use every button, then verify chat in two browser windows.
5. `/register`, `/login`, `/account/security`: register, sign in, and configure TOTP.
6. `/examples/audit`: record a normal event and the secret-redaction example.
7. `/examples/messaging`: send Mail/SMS now and later; inspect the API console and Audit cards.

## 4. Deploy

For production, apply migrations once, supervise app and worker with systemd, and proxy through Nginx
with WebSocket upgrades and buffering disabled for SSE. Follow [Deploy to a VPS](../deployment.md) and
the [production checklist](../production-checklist.md).

## What you built

- Elysia + Drizzle resources and an Eden/SvelteKit UI
- relationships and local/S3-compatible attachments
- PostgreSQL Jobs, SSE progress, and WebSocket communication
- Better Auth password identity, OAuth integration points, TOTP, and backup codes
- append-only Audit history and immediate/queued Mail/SMS

## Parity checklist

The maintained test app and this guide share these visible destinations:

- `/categories` and `/products` for the core relationship/attachment example
- `/users`, `/tags`, `/posts`, and `/comments` for the publishing model
- `/blog` for the composed publishing read experience
- `/realtime` for the explicitly composed Job/SSE/WebSocket demo
- `/login`, `/register`, `/account`, and `/account/security` for Auth
- `/examples/audit` and `/examples/messaging` for the operational demos

Each non-Auth destination has an explicit entry in `web/src/lib/resources.ts`. Auth is contextual in
the sidebar footer. Jobs have no standalone link: progress appears at `/realtime`, while queued message
delivery appears at `/examples/messaging`.

Messaging may use Jobs and Audit; it does not require Realtime. Audit does not enqueue or publish.
Realtime is transient. Jobs are durable execution.

:::tip Final verification
Repeat migrations and this smoke path against a fresh database. The tutorial contains no unexplained
extra resource model, hidden route discovery, pre-existing showcase file, or hidden seed requirement.
:::
