---
title: How a Bunway request works
---

# How a Bunway request works

A generated Bunway application is two cooperating applications during development:

```text
Browser
├── UI requests ───────────────→ SvelteKit/Vite :5173
└── API, SSE, and WebSocket ───→ Elysia/Bun :3000
                                      │
                                      ├── validation: Elysia `t`
                                      ├── queries: Drizzle
                                      ├── connection: Bun.SQL
                                      └── data: PostgreSQL
```

Bunway generates and connects the files, but it does not insert a controller, repository, serializer,
or proprietary rendering layer into this path.

## The complete mental map

```text
Developer starts `bunway dev`
│
├── Bun watches `src/app.ts`
│   └── Elysia composes middleware and explicitly registered route modules
│
└── Bun starts Vite in `web/`
    └── SvelteKit serves the browser application and recompiles changed Svelte files

Browser opens /products
│
├── SvelteKit selects web/src/routes/products/+page.svelte
├── the root +layout.svelte renders the sidebar, header, and page
├── the page creates an Eden Treaty client typed from `App`
└── the page requests GET http://localhost:3000/products
    │
    ├── CORS middleware accepts the configured browser origin
    ├── Elysia matches the generated Products route
    ├── Elysia validates query/path/body input when applicable
    ├── the route executes an explicit Drizzle query
    ├── Drizzle sends parameterized SQL through Bun.SQL
    ├── PostgreSQL executes the query and returns rows
    ├── Drizzle maps rows to typed JavaScript objects
    └── Elysia serializes the route result as an HTTP response
        │
        ├── Eden exposes the inferred result/error type
        ├── the Svelte page assigns the result to reactive state
        └── Svelte updates only the affected DOM
```

That tree is the central Bunway model: generated source coordinates direct library APIs.

## 1. Application startup

`bunway dev` starts two child processes under Bun:

```text
bun --watch src/app.ts
bun run --bun --cwd web dev
```

The backend entry point is `src/app.ts`:

```ts
export const app = new Elysia()
  .use(cors(...))
  .use(realtimeRoutes)
  .use(routes)

export type App = typeof app
```

`.use(routes)` imports the explicit composition from `src/routes/index.ts`. A generator adds imports and
`.use(...)` calls at marker comments. Bunway does not scan the filesystem at runtime.

`export type App = typeof app` preserves the entire Elysia contract. The frontend imports this as a
type, so Eden Treaty knows the route paths, input shapes, and response shapes without a separate DTO or
generated client file.

## 2. The initial page request

When the browser opens `http://localhost:5173/products`, SvelteKit maps the URL to:

```text
web/src/routes/+layout.svelte          persistent application shell
web/src/routes/products/+page.svelte  collection page
```

The layout renders the sidebar and then `{@render children()}` renders the selected page. The generated
preview currently loads CRUD data in the browser, so Vite/SvelteKit first returns the application HTML
and JavaScript; the mounted page then calls the API. Applications remain free to move data loading into
SvelteKit server `load` functions when SSR is required—Bunway does not wrap that mechanism.

## 3. Eden creates the typed request

Generated pages construct the normal Eden Treaty client:

```ts
import { treaty } from '@elysiajs/eden'
import type { App } from '../../../../src/app'

const api = treaty<App>('http://localhost:3000')
const result = await api.products.get({ query: { page: 1 } })
```

The `App` type is erased at runtime. The browser sends an ordinary HTTP request. Eden's value is compile-
time inference: if a route path, body, or response changes, TypeScript can identify frontend calls that
must change with it.

## 4. Elysia receives and validates it

The request reaches Bun's HTTP server and flows through the Elysia composition order in `src/app.ts`.
For a generated resource, Elysia then matches a route in `src/routes/products.ts`.

```ts
new Elysia({ prefix: '/products' }).post(
  '/',
  async ({ body, status }) => {
    const [product] = await db.insert(products).values(body).returning()
    return status(201, product)
  },
  { body: productInput },
)
```

The schema passed in `{ body: productInput }` validates untrusted input before the handler uses it. An
invalid body receives a validation response; it does not reach the insert. The handler is still plain
Elysia code and may be edited directly.

## 5. Drizzle and Bun.SQL reach PostgreSQL

`src/db/index.ts` owns the runtime connection:

```ts
export const db = postgresDrizzle(new Bun.SQL(required('DATABASE_URL', Bun.env.DATABASE_URL)))
```

The generated handler imports `db` and a table from `src/db/schema`. Drizzle translates its typed query
builder into parameterized SQL, and Bun.SQL sends it to PostgreSQL. Bunway does not introduce a model
base class or repository between them.

Drizzle Kit is separate tooling. `bunway db:migrate` reads `drizzle.config.ts`, compares the Drizzle
schema to migration history, writes SQL under `src/db/migrations`, and applies it. Runtime requests do
not invoke Drizzle Kit.

## 6. The response becomes rendered UI

The handler returns an ordinary value. Elysia serializes it, Eden returns `{ data, error }`, and the
Svelte page updates reactive state:

```ts
const result = await api.products.get()
if (result.error) message = 'Could not load products'
else products = result.data.items
```

Svelte tracks reads of `products` in the template and updates the table when that state changes. There
is no Bunway renderer. Tailwind classes style the markup, while the checked-in shadcn-svelte components
provide editable UI primitives.

## Create, update, and delete requests

Mutations follow the same path with different HTTP methods:

```text
Svelte form
→ Eden POST/PATCH/DELETE
→ Elysia validation
→ generated route handler
→ Drizzle insert/update/delete
→ Bun.SQL
→ PostgreSQL transaction
→ typed response
→ Svelte state refresh
```

Expected failures remain visible as `error` results. Generated destructive actions request confirmation
in the UI, but authorization and business rules belong in the application route because browser checks
are not a security boundary.

## Attachments

Attachment fields deliberately do not add binary columns to a resource table:

```text
browser multipart upload
→ generated resource attachment endpoint
→ Storage adapter writes bytes (local disk or Bun S3)
→ Drizzle inserts storage_blobs metadata
→ Drizzle inserts storage_attachments polymorphic link
→ response contains attachment metadata/URL
→ Svelte renders preview or count
```

The resource row and attachment records remain independently understandable. Storage adapters manage
bytes; PostgreSQL remains the metadata source of truth.

## Jobs

`performNow(payload)` calls the Job handler in the current process. `performLater(payload)` inserts a
row into PostgreSQL:

```text
request handler calls performLater
→ Jobs table receives payload, queue, and schedule
→ HTTP request can finish
→ `bunway worker` claims with PostgreSQL locking
→ worker imports src/jobs/index.ts
→ registered Job handler executes
→ row records completion, failure, or retry
```

The explicit `src/jobs/index.ts` registry ensures workers know which application Job names they can
execute. Redis and a separate queue service are not required.

## Realtime

Both transports use Bun/Elysia endpoints already mounted by `realtimeRoutes`:

```text
SSE: browser subscribes → API keeps HTTP stream open → channel.publish sends server events
WebSocket: browser connects → either side sends typed events → channel broadcasts to peers
```

The current preview broker is process-local. A Job executed by a separate worker persists correctly but
cannot push through the API process's in-memory broker. Use same-process execution for a visible progress
demo, or add an application-appropriate cross-process transport when the requirement is real.

## Where to debug each failure

| Symptom | First place to inspect |
| --- | --- |
| Page URL is missing | `web/src/routes`, then `web/src/lib/resources.ts` for navigation |
| API returns 404 | `src/routes/index.ts` explicit import and `.use(...)` |
| API returns validation error | Elysia input schema in the resource route |
| Database connection fails | `.env`, `src/db/index.ts`, and PostgreSQL availability |
| Schema and database differ | `drizzle.config.ts`, schema exports, then `bunway db:migrate` |
| Frontend type no longer matches | exported `App` type and the Eden call site |
| UI does not refresh | Svelte state assignment after the request |
| Job remains queued | worker process, `src/jobs/index.ts`, queue selection, and Jobs table |
| Realtime connects but receives nothing | channel name/parameters and process boundary |

Next, see the concrete [project structure](./project-structure.md) that owns every part of this flow.
