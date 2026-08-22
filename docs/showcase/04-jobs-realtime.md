---
title: 4. Build the Jobs and Realtime showcase
---

# 4. Build the Jobs and Realtime showcase

This step builds the complete `/realtime` page from the maintained test app: notifications, live order
status, Job progress, dashboard counters, and WebSocket chat.

## 1. Generate the starting files

```sh
bunway g job ProcessDemoFile
bunway g realtime custom Showcase --transport=sse
bunway db:migrate
```

The Job generator creates and registers `src/jobs/process-demo-file.ts`. The Realtime generator creates
`src/realtime/showcase.ts`. Replace their contents below so the channel contracts and UI agree exactly.

## 2. Implement the demo Job

Replace `src/jobs/process-demo-file.ts` with:

```ts
import { job } from '@bunway/core'

export const processDemoFile = job(
  'process-demo-file',
  async (_payload: {}, { progress }) => {
    for (const [percent, message] of [
      [10, 'Loading file'],
      [35, 'Analyzing'],
      [65, 'Processing'],
      [90, 'Generating result'],
      [100, 'Complete'],
    ] as const) {
      await Bun.sleep(250)
      await progress(percent, message)
    }
  },
)
```

Open `src/jobs/index.ts` and confirm it contains this export before `// bunway:jobs`:

```ts
export { processDemoFile } from './process-demo-file'
```

## 3. Define the typed channels

Replace `src/realtime/showcase.ts` with:

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

export const orderStatusChannel = channel('status/:id', {
  events: { updated: t.Object({ status: t.String() }) },
})

export const dashboardChannel = channel('dashboard', {
  events: {
    updated: t.Object({
      statusChanges: t.Number(),
      eventsPublished: t.Number(),
      jobsRunning: t.Number(),
    }),
  },
})

export const chatChannel = channel('chat/:id', {
  events: {
    message: t.Object({ name: t.String(), text: t.String() }),
  },
})
```

No channel discovery occurs. Importing these definitions from the route below registers the contracts
with the process-local broker used by Bunway's existing Realtime transport.

## 4. Create the demo API

Create `src/routes/realtime.ts`:

```ts
import { Elysia } from 'elysia'
import { processDemoFile } from '../jobs/process-demo-file'
import {
  dashboardChannel,
  notificationsChannel,
  orderStatusChannel,
} from '../realtime/showcase'

const statuses = ['received', 'processing', 'quality_check', 'completed'] as const
let statusIndex = 0
let eventsPublished = 0
let jobsRunning = 0
let statusChanges = 0

function dashboard() {
  dashboardChannel.publish('updated', {
    statusChanges,
    eventsPublished,
    jobsRunning,
  })
}

export const realtimeShowcaseRoutes = new Elysia({ prefix: '/realtime/showcase' })
  .post('/notifications', () => {
    const messages = [
      'Background maintenance will begin in 10 minutes.',
      'The Bunway realtime showcase is connected.',
      'A new developer preview is ready to try.',
    ]
    const data = {
      title: 'System Notification',
      message: messages[eventsPublished % messages.length]!,
      createdAt: new Date().toISOString(),
    }
    notificationsChannel.publish('notification', data)
    eventsPublished++
    dashboard()
    return data
  })
  .get('/status', () => ({ id: 'DEMO-1001', status: statuses[statusIndex] }))
  .post('/status', () => {
    statusIndex = (statusIndex + 1) % statuses.length
    statusChanges++
    const data = { status: statuses[statusIndex]! }
    orderStatusChannel.publish('DEMO-1001', 'updated', data)
    eventsPublished++
    dashboard()
    return data
  })
  .post('/activity', () => {
    eventsPublished++
    dashboard()
    return { ok: true }
  })
  .post('/jobs', () => {
    jobsRunning++
    dashboard()
    void processDemoFile.performNow({}, { id: 'demo-file' }).finally(() => {
      jobsRunning--
      eventsPublished += 5
      dashboard()
    })
    return { id: 'demo-file' }
  })
```

Register it in `src/routes/index.ts` by adding:

```ts
import { realtimeShowcaseRoutes } from './realtime'
```

and, before `// bunway:routes`:

```ts
.use(realtimeShowcaseRoutes)
```

Restart `bunway dev`. Verify the HTTP portion before adding UI:

```sh
curl http://localhost:3000/realtime/showcase/status
curl -X POST http://localhost:3000/realtime/showcase/notifications
```

## 5. Create the complete Svelte page

Create `web/src/routes/realtime/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { realtime } from '@bunway/core/realtime/browser'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'

  const api = 'http://localhost:3000/realtime/showcase'
  let notification = $state('Waiting for notifications…')
  let status = $state('received')
  let jobProgress = $state(0)
  let jobMessage = $state('Ready to process a demo file.')
  let statusChanges = $state(0)
  let eventsPublished = $state(0)
  let jobsRunning = $state(0)
  let displayName = $state(`Browser ${Math.floor(Math.random() * 90) + 10}`)
  let message = $state('Hello from Bunway')
  type ChatEvents = { message: { name: string; text: string } }
  let chatMessages = $state<ChatEvents['message'][]>([])
  let chat: ReturnType<typeof realtime.connect<ChatEvents>> | undefined

  onMount(() => {
    const notificationSubscription = realtime.subscribe('notifications', (event) => {
      notification = (event.data as { message: string }).message
    })
    const statusSubscription = realtime.subscribe('status:DEMO-1001', (event) => {
      status = (event.data as { status: string }).status
    })
    const dashboardSubscription = realtime.subscribe('dashboard', (event) => {
      const data = event.data as {
        statusChanges: number
        eventsPublished: number
        jobsRunning: number
      }
      statusChanges = data.statusChanges
      eventsPublished = data.eventsPublished
      jobsRunning = data.jobsRunning
    })
    const jobSubscription = realtime.job('demo-file', (event) => {
      jobProgress = event.data.progress
      jobMessage = event.data.message
    })
    chat = realtime.connect<ChatEvents>('chat:demo')
    const stopChat = chat.on('message', (event) => {
      chatMessages = [...chatMessages, event.data]
    })
    void fetch(`${api}/status`)
      .then((response) => response.json())
      .then((data) => (status = data.status))
    void fetch(`${api}/activity`, { method: 'POST' })
    return () => {
      notificationSubscription.close()
      statusSubscription.close()
      dashboardSubscription.close()
      jobSubscription.close()
      stopChat()
      chat?.close()
    }
  })

  async function startJob() {
    jobProgress = 0
    jobMessage = 'Queued'
    await fetch(`${api}/jobs`, { method: 'POST' })
  }

  function sendChat() {
    if (!message.trim() || !displayName.trim()) return
    chat?.send('message', { name: displayName, text: message })
    message = ''
  }
</script>

<svelte:head><title>Bunway Realtime Showcase</title></svelte:head>

<main class="w-full min-w-0 px-4 py-8 sm:px-6 lg:px-8">
  <p class="text-sm font-medium uppercase tracking-widest text-muted-foreground">Examples</p>
  <h1 class="mt-2 text-4xl font-bold">Bunway Realtime</h1>
  <p class="mt-3 text-muted-foreground">
    One typed realtime API. SSE for streams. WebSockets for conversations.
  </p>
  <p class="mt-2 rounded-md border bg-muted/40 p-3 text-sm">
    Open this page in another window to see events synchronize.
  </p>

  <div class="mt-8 grid gap-5 lg:grid-cols-2">
    <section class="rounded-xl border bg-card p-6 shadow-sm">
      <h2 class="text-xl font-semibold">Generic Notifications <span class="badge">SSE</span></h2>
      <p class="mt-4 min-h-12 text-muted-foreground">{notification}</p>
      <Button onclick={() => fetch(`${api}/notifications`, { method: 'POST' })}>
        Send Notification
      </Button>
    </section>

    <section class="rounded-xl border bg-card p-6 shadow-sm">
      <h2 class="text-xl font-semibold">Live Status <span class="badge">SSE</span></h2>
      <p class="mt-4 text-sm text-muted-foreground">Order #DEMO-1001</p>
      <p class="my-3 text-2xl font-semibold capitalize">{status.replace('_', ' ')}</p>
      <Button onclick={() => fetch(`${api}/status`, { method: 'POST' })}>Advance Status</Button>
    </section>

    <section class="rounded-xl border bg-card p-6 shadow-sm">
      <h2 class="text-xl font-semibold">Background Job Progress <span class="badge">SSE</span></h2>
      <p class="mt-4 text-muted-foreground">{jobMessage}</p>
      <div class="my-3 h-3 overflow-hidden rounded-full bg-muted">
        <div class="h-full bg-primary transition-all" style:width={`${jobProgress}%`}></div>
      </div>
      <p class="mb-4 text-sm tabular-nums">{jobProgress}%</p>
      <Button onclick={startJob}>Start Processing</Button>
    </section>

    <section class="rounded-xl border bg-card p-6 shadow-sm">
      <h2 class="text-xl font-semibold">Live Dashboard <span class="badge">SSE</span></h2>
      <dl class="my-4 grid grid-cols-3 gap-3 text-center">
        <div><dt class="text-xs">Status</dt><dd class="text-2xl font-bold">{statusChanges}</dd></div>
        <div><dt class="text-xs">Events</dt><dd class="text-2xl font-bold">{eventsPublished}</dd></div>
        <div><dt class="text-xs">Jobs</dt><dd class="text-2xl font-bold">{jobsRunning}</dd></div>
      </dl>
      <Button onclick={() => fetch(`${api}/activity`, { method: 'POST' })}>Generate Activity</Button>
    </section>

    <section class="rounded-xl border bg-card p-6 shadow-sm lg:col-span-2">
      <h2 class="text-xl font-semibold">Realtime Chat <span class="badge">WebSocket</span></h2>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <Input aria-label="Display name" bind:value={displayName} />
        <Input
          aria-label="Message"
          bind:value={message}
          onkeydown={(event) => event.key === 'Enter' && sendChat()}
        />
      </div>
      <Button class="mt-3" onclick={sendChat}>Send</Button>
      <div class="mt-5 min-h-24 space-y-2 border-t pt-4">
        {#if chatMessages.length === 0}<p>Waiting for messages…</p>{/if}
        {#each chatMessages as item}<p><strong>{item.name}:</strong> {item.text}</p>{/each}
      </div>
    </section>
  </div>
</main>

<style>
  .badge {
    margin-left: 0.4rem;
    border-radius: 9999px;
    background: color-mix(in oklab, var(--primary) 12%, transparent);
    padding: 0.25rem 0.6rem;
    font-size: 0.75rem;
    color: var(--primary);
  }
</style>
```

## 6. Add navigation and verify

Insert this before `// bunway:resources` in `web/src/lib/resources.ts`:

```ts
{ label: 'Realtime Showcase', href: '/realtime', icon: 'chat' },
```

Restart `bunway dev`, open `http://localhost:5173/realtime` in two windows, and test every card.

The visible demo uses `performNow()` because the Realtime broker is process-local. To verify durable
execution separately, change a call to `processDemoFile.performLater({})`, start `bunway worker` in a
second terminal, and inspect the completed Job. A separate worker cannot currently publish to an SSE
client connected to the API process.

Next: [add Authentication](./05-auth.md).
