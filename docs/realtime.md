---
title: Realtime
---

# Realtime

Bunway Realtime uses one small typed channel API and native browser transports.

| Use case | Transport |
| --- | --- |
| Notifications | SSE |
| Live status | SSE |
| Job progress | SSE |
| AI streaming | SSE |
| Dashboard | SSE |
| Chat | WebSocket |
| Presence | WebSocket |
| Collaboration | WebSocket |

SSE is the default for server-to-client updates. WebSockets are for conversations where both the
browser and server send messages. Raw Elysia routes remain available for lower-level control.

## Define and publish a channel

```ts
import { channel } from '@bunway/core/realtime'
import { t } from 'elysia'

export const orderStatusChannel = channel('orders/:id', {
  events: {
    updated: t.Object({ status: t.String() }),
    completed: t.Object({ total: t.Number() }),
  },
})

orderStatusChannel.publish(order.id, 'updated', { status: 'processing' })
```

Path parameters, event names, and payloads are inferred. Invalid payloads fail TypeScript checking.
Published events use `{ channel, type, data, timestamp }`. Register the Elysia routes once; new Bunway
applications already do this:

```ts
export const app = new Elysia().use(realtimeRoutes)
```

## Subscribe with SSE

```ts
import { realtime } from '@bunway/core/realtime/browser'

const subscription = realtime.subscribe('notifications', event => {
  console.log(event.type, event.data)
})

subscription.close()
```

Native `EventSource` reconnection is used, and closing releases the in-memory listener. Channel
definitions type server publishing; browser helpers stay in a browser-only entry so Elysia server code
does not enter the frontend bundle.

## Connect with WebSockets

```ts
import { realtime } from '@bunway/core/realtime/browser'

type ChatEvents = { message: { name: string; text: string } }
const room = realtime.connect<ChatEvents>(`rooms:${roomId}`)
const off = room.on('message', event => console.log(event.data.text))
room.send('message', { name: 'Browser 1', text: 'Hello' })

off()
room.close()
```

The preview does not add a WebSocket reconnection state machine. Reconnect explicitly when needed.

## Job progress

```ts
export const processOrder = job('process-order', async ({ orderId }, { progress }) => {
  await progress(10, 'Loading order')
  await progress(60, 'Processing')
  await progress(100, 'Complete')
})
```

Observe it with `realtime.job(jobId, listener)`. Progress contains `status`, `progress`, and `message`.
In-memory delivery only crosses code in the same Bun process; separate worker delivery needs the future
multi-instance bridge below.

## Generate a recipe

```sh
bunway g realtime notifications
bunway g realtime status Order
bunway g realtime progress ProcessOrder
bunway g realtime chat Room
bunway g realtime custom Activity --transport=sse
```

`bunway g realtime` prompts for a use case. Recipes choose SSE for notifications, status, progress,
streams, and dashboards, and WebSockets for chat and presence. Generated files are ordinary typed
channel definitions under `src/realtime/`.

Notifications broadcast application events. Status uses parameterized resource channels. Progress
uses SSE and the job context. Streams and dashboards use transient SSE updates. Chat uses typed
WebSocket messages. Presence may use WebSocket open and close events; Bunway adds no identity or auth.

Channels are public unless surrounding Elysia routes enforce authorization. This preview does not
invent authentication behavior.

## Scaling

Delivery is an in-process map. Events are transient: there is no history, polling, Redis, or database
write in the publish path. Multi-instance delivery can later bridge the same API through PostgreSQL
`LISTEN/NOTIFY`:

```text
Bun #1 -- NOTIFY --> PostgreSQL -- LISTEN --> Bun #2 / Bun #3 --> SSE or WebSocket
```

There is no `REALTIME_DRIVER` setting because no second driver exists yet.

## Copy-paste recipe: application notifications

Generate the contract:

```sh
bunway g realtime notifications
```

The generated `src/realtime/notifications.ts` is the single source of truth:

```ts
import { channel } from '@bunway/core/realtime'
import { t } from 'elysia'

export const notificationsChannel = channel('notifications', {
  events: {
    notification: t.Object({
      title: t.String(),
      message: t.String(),
      createdAt: t.String(),
    }),
  },
})
```

Publish from an ordinary Elysia action:

```ts
import { Elysia } from 'elysia'
import { notificationsChannel } from '../realtime/notifications'

export const notificationRoutes = new Elysia({ prefix: '/notifications' })
  .post('/', () => {
    const notification = {
      title: 'System notification',
      message: 'Background maintenance begins in 10 minutes.',
      createdAt: new Date().toISOString(),
    }

    notificationsChannel.publish('notification', notification)
    return notification
  })
```

Register that route explicitly in `src/routes/index.ts`:

```ts
import { notificationRoutes } from './notifications'

export const routes = new Elysia().use(notificationRoutes)
```

Subscribe in a Svelte page. The browser helper uses `EventSource`; there is no polling:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { realtime } from '@bunway/core/realtime/browser'

  let latest = $state('Waiting for notifications…')

  onMount(() => {
    const subscription = realtime.subscribe('notifications', event => {
      latest = (event.data as { message: string }).message
    })

    return () => subscription.close()
  })

  async function send() {
    await fetch('http://localhost:3000/notifications', { method: 'POST' })
  }
</script>

<button onclick={send}>Send notification</button>
<p>{latest}</p>
```

Open the page in two windows. One POST publishes to both connected SSE subscribers.

## Copy-paste recipe: resource status

Generate a parameterized channel:

```sh
bunway g realtime status Order
```

Use the generated contract from an update route:

```ts
import { Elysia, t } from 'elysia'
import { orderStatusChannel } from '../realtime/order-status'

export const orderStatusRoutes = new Elysia({ prefix: '/orders' })
  .patch('/:id/status', ({ params, body }) => {
    // Persist with Drizzle here when the status is durable.
    orderStatusChannel.publish(params.id, 'updated', { status: body.status })
    return body
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({ status: t.String() }),
  })
```

Subscribe to one order in Svelte:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { realtime } from '@bunway/core/realtime/browser'

  let { orderId, initialStatus } = $props<{ orderId: string; initialStatus: string }>()
  let status = $state(initialStatus)

  onMount(() => {
    const subscription = realtime.subscribe(`orders:${orderId}`, event => {
      if (event.type === 'updated') {
        status = (event.data as { status: string }).status
      }
    })

    return () => subscription.close()
  })
</script>

<p>Order status: {status}</p>
```

Fetch durable initial state normally, then use SSE only for changes. Realtime messages should not
replace PostgreSQL as the source of truth.

## Copy-paste recipe: job progress

Create a job:

```sh
bunway g job ProcessOrder
```

Add progress calls to the generated handler:

```ts
import { job } from '@bunway/core'

export const processOrder = job(
  'process-order',
  async ({ orderId }: { orderId: string }, { progress }) => {
    await progress(10, 'Loading order')
    // Perform work.
    await progress(60, 'Processing payment')
    // Perform work.
    await progress(100, 'Complete')
  },
)
```

For a same-process operation, create the ID in the browser, connect first, and then start work. Connecting
first prevents a short job from publishing before `EventSource` is ready:

```svelte
<script lang="ts">
  import { realtime, type JobProgress } from '@bunway/core/realtime/browser'

  let percent = $state(0)
  let message = $state('Ready')

  function start() {
    const id = crypto.randomUUID()
    const subscription = realtime.job(id, event => {
      const update = event.data as JobProgress
      percent = update.progress
      message = update.message
      if (update.status === 'completed' || update.status === 'failed') subscription.close()
    })

    subscription.source.onopen = () => {
      void fetch('http://localhost:3000/process-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, orderId: 'ORDER-1001' }),
      })
    }
  }
</script>

<button onclick={start}>Process order</button>
<progress value={percent} max="100"></progress>
<span>{percent}% — {message}</span>
```

The corresponding route passes the client-created operation ID to `performNow`:

```ts
export const processOrderRoutes = new Elysia()
  .post('/process-order', ({ body }) => {
    void processOrder.performNow(
      { orderId: body.orderId },
      { id: body.id },
    )
    return { id: body.id }
  }, {
    body: t.Object({ id: t.String(), orderId: t.String() }),
  })
```

The memory broker cannot relay progress from a separate `bunway worker` process to the API process.
Use this same-process form for the preview, or wait for the PostgreSQL `LISTEN/NOTIFY` bridge before
depending on cross-process job progress.

## Copy-paste recipe: chat

Generate the typed WebSocket contract:

```sh
bunway g realtime chat Room
```

Connect from Svelte:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { realtime } from '@bunway/core/realtime/browser'

  let name = $state('Browser 1')
  let text = $state('')
  let messages = $state<Array<{ name: string; text: string }>>([])
  let room: ReturnType<typeof realtime.connect> | undefined

  onMount(() => {
    room = realtime.connect('rooms:demo')
    const off = room.on('message', event => {
      messages = [...messages, event.data as { name: string; text: string }]
    })

    return () => {
      off()
      room?.close()
    }
  })

  function send() {
    if (!text.trim()) return
    room?.send('message', { name, text })
    text = ''
  }
</script>

<input aria-label="Display name" bind:value={name} />
<input aria-label="Message" bind:value={text} />
<button onclick={send}>Send</button>

{#each messages as message}
  <p><strong>{message.name}:</strong> {message.text}</p>
{/each}
```

The standard `realtimeRoutes` WebSocket endpoint broadcasts messages to other connections on the same
channel. Messages are ephemeral and intentionally not persisted. Store them with ordinary Drizzle
queries when chat history is a product requirement.

## Guidance for coding agents

Classify the use case first. Notifications, status, progress, AI streaming, and dashboards use SSE.
Chat, presence, collaboration, and interactive control use WebSockets. Prefer Bunway Realtime over
installing another realtime framework unless a concrete requirement exceeds this small API.
