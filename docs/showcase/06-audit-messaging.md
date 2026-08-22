---
title: 6. Build Audit and Messaging demos
---

# 6. Build Audit and Messaging demos

This step generates Audit, Mail, and SMS, then builds the same two operational pages as the test app.
`bun create bunway showcase` creates the starter, not a pre-seeded finished demo; completing this step
is what adds the visible **Audit Showcase** and **Messaging Showcase** sidebar pages.

## 1. Generate the capabilities

```sh
bunway g audit
bunway g mailer Order confirmation
bunway g sms Order shipped
bunway db:migrate
```

The generators create `src/audit`, `src/messaging`, `src/mailers/order.ts`, `src/sms/order.ts`, the
Audit schema, and delivery Jobs. Development defaults to console delivery, so no provider account is
required.

## 2. Create the Audit API

Create `src/routes/audit.ts`:

```ts
import { desc } from 'drizzle-orm'
import { Elysia, t } from 'elysia'
import { audit } from '../audit'
import { authPlugin } from '../auth/plugin'
import { db } from '../db'
import { auditLogs } from '../db/schema/audit-logs'

const reference = t.Optional(
  t.Object({
    type: t.String({ minLength: 1, maxLength: 255 }),
    id: t.Optional(t.Union([t.String(), t.Number()])),
  }),
)

const body = t.Object({
  event: t.String({ minLength: 1, maxLength: 255 }),
  actor: reference,
  subject: reference,
  metadata: t.Optional(t.Record(t.String(), t.Unknown())),
})

async function recent() {
  return db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(50)
}

export const auditShowcaseRoutes = new Elysia({ prefix: '/examples/audit' })
  .use(authPlugin)
  .get('/', recent)
  .post(
    '/',
    async ({ body, status }) => {
      await audit.record(body.event, body)
      return status(201, { records: await recent() })
    },
    { body },
  )
  .post(
    '/authenticated',
    async ({ user, status }) => {
      await audit.record('auth.audit_demo', {
        actor: { type: 'user', id: user.id },
        subject: { type: 'audit_showcase' },
        metadata: { method: 'better-auth-session' },
      })
      return status(201, { records: await recent() })
    },
    { auth: true },
  )
```

## 3. Create the Audit page

Create `web/src/routes/examples/audit/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { authClient } from '$lib/auth-client'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Textarea } from '$lib/components/ui/textarea/index.js'

  type AuditLog = {
    id: string
    event: string
    actorType: string | null
    actorId: string | null
    subjectType: string | null
    subjectId: string | null
    metadata: Record<string, unknown> | null
    createdAt: string
  }

  const endpoint = 'http://localhost:3000/examples/audit'
  const session = authClient.useSession()
  let records = $state<AuditLog[]>([])
  let event = $state('order.approved')
  let actorType = $state('demo')
  let actorId = $state('browser-1')
  let subjectType = $state('order')
  let subjectId = $state('DEMO-1001')
  let metadata = $state(JSON.stringify({ previousStatus: 'pending', newStatus: 'approved' }, null, 2))
  let message = $state('')

  async function load() {
    const response = await fetch(endpoint)
    if (response.ok) records = await response.json()
  }

  async function record() {
    let values: Record<string, unknown>
    try {
      values = JSON.parse(metadata)
    } catch {
      message = 'Metadata must be valid JSON.'
      return
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event,
        actor: actorType ? { type: actorType, id: actorId || undefined } : undefined,
        subject: subjectType ? { type: subjectType, id: subjectId || undefined } : undefined,
        metadata: values,
      }),
    })
    if (!response.ok) {
      message = await response.text()
      return
    }
    records = (await response.json()).records
    message = 'Durable audit event recorded.'
  }

  async function recordAuthenticated() {
    const response = await fetch(`${endpoint}/authenticated`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) {
      message = 'Sign in before recording an authenticated event.'
      return
    }
    records = (await response.json()).records
    message = 'Authenticated event recorded.'
  }

  function useSanitizationExample() {
    event = 'integration.connected'
    metadata = JSON.stringify(
      { provider: 'demo', accessToken: 'secret', nested: { password: 'secret', safe: 'visible' } },
      null,
      2,
    )
  }

  onMount(load)
</script>

<svelte:head><title>Bunway Audit</title></svelte:head>

<main class="w-full min-w-0 space-y-8 px-4 py-8 sm:px-6 lg:px-8">
  <header>
    <p class="text-sm uppercase tracking-wide text-muted-foreground">Durable application facts</p>
    <h1 class="text-3xl font-semibold">Bunway Audit</h1>
  </header>
  <div class="grid gap-8 lg:grid-cols-2">
    <section class="space-y-5 rounded-lg border bg-card p-6 shadow-sm">
      <h2 class="text-xl font-semibold">Record an audit event</h2>
      <label>Event <Input bind:value={event} /></label>
      <div class="grid gap-4 sm:grid-cols-2">
        <label>Actor type <Input bind:value={actorType} /></label>
        <label>Actor ID <Input bind:value={actorId} /></label>
        <label>Subject type <Input bind:value={subjectType} /></label>
        <label>Subject ID <Input bind:value={subjectId} /></label>
      </div>
      <label>Metadata JSON <Textarea class="min-h-48 font-mono" bind:value={metadata} /></label>
      <div class="flex flex-wrap gap-3">
        <Button onclick={record}>Record event</Button>
        <Button variant="outline" onclick={useSanitizationExample}>Load redaction example</Button>
      </div>
      <p class="text-sm">{$session.data ? `Signed in as ${$session.data.user.email}` : 'Not signed in'}</p>
      <Button variant="outline" onclick={recordAuthenticated}>Record authenticated event</Button>
      {#if message}<p class="rounded-md bg-muted p-3">{message}</p>{/if}
    </section>
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Recent audit events</h2>
      {#each records as record (record.id)}
        <article class="rounded-lg border bg-card p-5 shadow-sm">
          <strong class="font-mono">{record.event}</strong>
          <time class="float-right text-xs">{new Date(record.createdAt).toLocaleString()}</time>
          <p>Actor: {record.actorType ? `${record.actorType}:${record.actorId ?? '—'}` : '—'}</p>
          <p>Subject: {record.subjectType ? `${record.subjectType}:${record.subjectId ?? '—'}` : '—'}</p>
          {#if record.metadata}<pre class="overflow-x-auto bg-muted p-3">{JSON.stringify(record.metadata, null, 2)}</pre>{/if}
        </article>
      {:else}
        <p class="rounded-lg border border-dashed p-8">No audit events yet.</p>
      {/each}
    </section>
  </div>
</main>
```

## 4. Create the Messaging API

Create `src/routes/messaging.ts`:

```ts
import { desc, inArray } from 'drizzle-orm'
import { Elysia, t } from 'elysia'
import { workOnce } from '@bunway/core'
import { db } from '../db'
import { auditLogs } from '../db/schema/audit-logs'
import { mail, sms } from '../messaging'
import { orderMailer } from '../mailers/order'
import { orderSms } from '../sms/order'

const mailBody = t.Object({
  to: t.String({ minLength: 3 }),
  subject: t.String({ minLength: 1 }),
  text: t.String({ minLength: 1 }),
  later: t.Optional(t.Boolean()),
})
const smsBody = t.Object({
  to: t.String({ minLength: 5 }),
  text: t.String({ minLength: 1 }),
  later: t.Optional(t.Boolean()),
})

async function recent() {
  return db
    .select()
    .from(auditLogs)
    .where(
      inArray(auditLogs.event, [
        'mail.logged',
        'mail.sent',
        'mail.failed',
        'sms.logged',
        'sms.sent',
        'sms.failed',
      ]),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(20)
}

function runShowcaseWorker() {
  setTimeout(() => void workOnce({ queues: ['messaging'] }), 250)
}

export const messagingShowcaseRoutes = new Elysia({
  prefix: '/examples/messaging',
})
  .get('/audit', recent)
  .post(
    '/mail',
    async ({ body }) => {
      if (!body.later) return { delivery: await mail.send(body) }
      const id = await mail.sendLater(body, { queue: 'messaging' })
      runShowcaseWorker()
      return { jobId: String(id) }
    },
    { body: mailBody },
  )
  .post(
    '/sms',
    async ({ body }) => {
      if (!body.later) return { delivery: await sms.send(body) }
      const id = await sms.sendLater(body, { queue: 'messaging' })
      runShowcaseWorker()
      return { jobId: String(id) }
    },
    { body: smsBody },
  )
  .post('/order-mailer', async () => {
    const id = await orderMailer
      .confirmation({
        to: 'demo@bunway.test',
        reference: 'DEMO-1001',
      })
      .sendLater({
        queue: 'messaging',
        audit: { subject: { type: 'order', id: 'DEMO-1001' } },
      })
    runShowcaseWorker()
    return { jobId: String(id) }
  })
  .post('/order-sms', async () => {
    const id = await orderSms
      .shipped({
        to: '+15555550100',
        reference: 'DEMO-1001',
      })
      .sendLater({
        queue: 'messaging',
        audit: { subject: { type: 'order', id: 'DEMO-1001' } },
      })
    runShowcaseWorker()
    return { jobId: String(id) }
  })
```

## 5. Create the Messaging page

Create `web/src/routes/examples/messaging/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { realtime } from '@bunway/core/realtime/browser'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Textarea } from '$lib/components/ui/textarea/index.js'

  type AuditLog = { id: string; event: string; metadata: Record<string, unknown> | null; createdAt: string }
  const endpoint = 'http://localhost:3000/examples/messaging'
  let mailTo = $state('demo@bunway.test')
  let subject = $state('Bunway test email')
  let mailText = $state('Hello from Bunway Mail')
  let smsTo = $state('+15555550100')
  let smsText = $state('Hello from Bunway SMS')
  let status = $state('Ready')
  let progress = $state(0)
  let records = $state<AuditLog[]>([])

  async function loadAudit() {
    const response = await fetch(`${endpoint}/audit`)
    if (response.ok) records = await response.json()
  }

  function watch(jobId: string) {
    status = 'Queued'
    progress = 0
    const subscription = realtime.job(jobId, (event) => {
      status = event.data.status === 'failed' ? `Failed: ${event.data.message}` : event.data.message
      progress = event.data.progress
      if (event.data.status !== 'running') {
        subscription.close()
        void loadAudit()
      }
    })
  }

  async function post(path: string, body?: unknown) {
    const response = await fetch(`${endpoint}/${path}`, {
      method: 'POST',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!response.ok) {
      status = await response.text()
      return
    }
    const result = await response.json()
    if (result.jobId) watch(result.jobId)
    else {
      status = `${result.delivery.status} by ${result.delivery.provider}`
      progress = 100
      await loadAudit()
    }
  }

  onMount(loadAudit)
</script>

<svelte:head><title>Bunway Messaging</title></svelte:head>

<main class="w-full min-w-0 space-y-8 px-4 py-8 sm:px-6 lg:px-8">
  <header><h1 class="text-3xl font-semibold">Bunway Mail and SMS</h1></header>
  <section class="rounded-lg border bg-card p-5 shadow-sm">
    <strong>{status}</strong>
    <div class="mt-4 h-2 overflow-hidden rounded-full bg-muted">
      <div class="h-full bg-primary" style:width={`${progress}%`}></div>
    </div>
  </section>
  <div class="grid gap-6 lg:grid-cols-2">
    <section class="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
      <h2 class="text-xl font-semibold">Email</h2>
      <label>To <Input bind:value={mailTo} /></label>
      <label>Subject <Input bind:value={subject} /></label>
      <label>Message <Textarea bind:value={mailText} /></label>
      <div class="flex gap-3">
        <Button onclick={() => post('mail', { to: mailTo, subject, text: mailText })}>Send now</Button>
        <Button variant="outline" onclick={() => post('mail', { to: mailTo, subject, text: mailText, later: true })}>Send later</Button>
      </div>
    </section>
    <section class="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
      <h2 class="text-xl font-semibold">SMS</h2>
      <label>To <Input bind:value={smsTo} /></label>
      <label>Message <Textarea bind:value={smsText} /></label>
      <div class="flex gap-3">
        <Button onclick={() => post('sms', { to: smsTo, text: smsText })}>Send now</Button>
        <Button variant="outline" onclick={() => post('sms', { to: smsTo, text: smsText, later: true })}>Send later</Button>
      </div>
    </section>
  </div>
  <section class="flex gap-3 rounded-lg border bg-card p-6 shadow-sm">
    <Button variant="outline" onclick={() => post('order-mailer')}>Send order confirmation</Button>
    <Button variant="outline" onclick={() => post('order-sms')}>Send shipping SMS</Button>
  </section>
  <section class="space-y-3">
    <h2 class="text-xl font-semibold">Recent Messaging Audit</h2>
    {#each records as record (record.id)}
      <article class="rounded-lg border bg-card p-4">
        <strong>{record.event}</strong>
        <time class="float-right text-xs">{new Date(record.createdAt).toLocaleString()}</time>
        <pre class="mt-3 overflow-x-auto bg-muted p-3">{JSON.stringify(record.metadata, null, 2)}</pre>
      </article>
    {:else}
      <p class="rounded-lg border border-dashed p-8">No Messaging audit events yet.</p>
    {/each}
  </section>
</main>
```

## 6. Register routes and navigation

In `src/routes/index.ts`, add:

```ts
import { auditShowcaseRoutes } from './audit'
import { messagingShowcaseRoutes } from './messaging'
```

and before `// bunway:routes`:

```ts
.use(auditShowcaseRoutes)
.use(messagingShowcaseRoutes)
```

In `web/src/lib/resources.ts`, before `// bunway:resources`, add:

```ts
{ label: 'Audit Showcase', href: '/examples/audit', icon: 'receipt' },
{ label: 'Messaging Showcase', href: '/examples/messaging', icon: 'chat' },
```

Restart `bunway dev`. Open both sidebar links. Record an Audit event, use the redaction example, send
Mail/SMS now, then send them later. Development delivery prints message content to the API console;
Audit stores delivery outcomes but never bodies or authentication secrets.

Seed and verify both operational demos without the UI (use `curl.exe` in PowerShell):

```sh
curl -X POST http://localhost:3000/examples/audit -H "content-type: application/json" -d '{"event":"order.approved","actor":{"type":"demo","id":"curl"},"subject":{"type":"order","id":"DEMO-1001"},"metadata":{"source":"showcase tutorial"}}'
curl -X POST http://localhost:3000/examples/messaging/mail -H "content-type: application/json" -d '{"to":"demo@bunway.test","subject":"Bunway Mail","text":"Hello from the Showcase"}'
curl -X POST http://localhost:3000/examples/messaging/sms -H "content-type: application/json" -d '{"to":"+15555550100","text":"Hello from Bunway SMS"}'
curl http://localhost:3000/examples/messaging/audit
```

PostgreSQL users can also exercise the **send later** buttons with `bunway worker`. On MySQL and SQLite,
use **send now** only: immediate Mail/SMS and Audit work on those adapters, while queued delivery uses
the PostgreSQL Jobs backend.

Next: [test, build, and deploy](./07-test-deploy.md).
