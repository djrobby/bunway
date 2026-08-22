# @bunway/core

The small runtime behind [Bunway](https://bunway.dev), a Rails-inspired application framework built
for Bun without hiding Bun, Elysia, Drizzle, PostgreSQL, or SvelteKit.

Bunway puts most of its value in conventions and generated application code. `@bunway/core` contains
only the runtime features that benefit from a shared, focused implementation:

- PostgreSQL-backed jobs and workers
- typed SSE and WebSocket channels
- local and S3-compatible storage
- mail and SMS delivery primitives
- named database configuration

## Installation

Generated Bunway applications install this package automatically. To add it directly:

```sh
bun add @bunway/core
```

## Jobs

```ts
import { job } from '@bunway/core'

export const processOrder = job(
  'process-order',
  async ({ orderId }: { orderId: string }) => {
    console.log(`Processing ${orderId}`)
  },
)

await processOrder.performNow({ orderId: 'order-123' })
await processOrder.performLater({ orderId: 'order-123' })
```

Run queued work through the Bunway CLI:

```sh
bunway worker
```

The package also exports `@bunway/core/realtime` for Elysia servers and
`@bunway/core/realtime/browser` for browser clients.

## Philosophy

This package deliberately stays small. Application routes remain ordinary Elysia routes, schemas and
queries remain ordinary Drizzle code, and PostgreSQL remains directly available. If Bunway disappeared,
your application should still be understandable.

See the [Bunway documentation](https://bunway.dev) for Jobs, Realtime, Storage, and Messaging guides.

