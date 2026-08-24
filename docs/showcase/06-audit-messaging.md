---
title: 4. Build the Mail and SMS showcase
---

# 4. Build the Mail and SMS showcase

This step adds the visible Mail/SMS demo immediately after the publishing showcase. Development uses
console delivery, so it works without provider credentials. Queued delivery is PostgreSQL-only;
immediate delivery works with PostgreSQL, MySQL, and SQLite.

## 1. Generate Messaging

```sh
bunway g mailer Order confirmation
bunway g sms Order shipped
bunway db:migrate
```

The first Messaging generator also creates Audit because delivery outcomes are recorded there. It
creates `src/messaging/index.ts`, `src/mailers/order.ts`, `src/sms/order.ts`, and two ordinary delivery
Jobs. Audit gets its own user-facing showcase later in this guide.

## 2. Create the Messaging API

Create `src/routes/messaging.ts` with this complete file:

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
      .confirmation({ to: 'demo@bunway.test', reference: 'DEMO-1001' })
      .sendLater({
        queue: 'messaging',
        audit: { subject: { type: 'order', id: 'DEMO-1001' } },
      })
    runShowcaseWorker()
    return { jobId: String(id) }
  })
  .post('/order-sms', async () => {
    const id = await orderSms
      .shipped({ to: '+15555550100', reference: 'DEMO-1001' })
      .sendLater({
        queue: 'messaging',
        audit: { subject: { type: 'order', id: 'DEMO-1001' } },
      })
    runShowcaseWorker()
    return { jobId: String(id) }
  })
```

## 3. Create the Messaging page

Create `web/src/routes/examples/messaging/+page.svelte` with this complete file:

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
      if (event.data.status !== 'running') { subscription.close(); void loadAudit() }
    })
  }

  async function post(path: string, body?: unknown) {
    const response = await fetch(`${endpoint}/${path}`, {
      method: 'POST',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!response.ok) { status = await response.text(); return }
    const result = await response.json()
    if (result.jobId) watch(result.jobId)
    else { status = `${result.delivery.status} by ${result.delivery.provider}`; progress = 100; await loadAudit() }
  }

  onMount(loadAudit)
</script>

<svelte:head><title>Bunway Messaging</title></svelte:head>
<main class="w-full min-w-0 space-y-8 px-4 py-8 sm:px-6 lg:px-8">
  <header><h1 class="text-3xl font-semibold">Bunway Mail and SMS</h1></header>
  <section class="rounded-lg border bg-card p-5 shadow-sm"><strong>{status}</strong><div class="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div class="h-full bg-primary" style:width={`${progress}%`}></div></div></section>
  <div class="grid gap-6 lg:grid-cols-2">
    <section class="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
      <h2 class="text-xl font-semibold">Email</h2>
      <label>To <Input bind:value={mailTo} /></label><label>Subject <Input bind:value={subject} /></label><label>Message <Textarea bind:value={mailText} /></label>
      <div class="flex gap-3"><Button onclick={() => post('mail', { to: mailTo, subject, text: mailText })}>Send now</Button><Button variant="outline" onclick={() => post('mail', { to: mailTo, subject, text: mailText, later: true })}>Send later</Button></div>
    </section>
    <section class="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
      <h2 class="text-xl font-semibold">SMS</h2>
      <label>To <Input bind:value={smsTo} /></label><label>Message <Textarea bind:value={smsText} /></label>
      <div class="flex gap-3"><Button onclick={() => post('sms', { to: smsTo, text: smsText })}>Send now</Button><Button variant="outline" onclick={() => post('sms', { to: smsTo, text: smsText, later: true })}>Send later</Button></div>
    </section>
  </div>
  <section class="flex gap-3 rounded-lg border bg-card p-6 shadow-sm"><Button variant="outline" onclick={() => post('order-mailer')}>Send order confirmation</Button><Button variant="outline" onclick={() => post('order-sms')}>Send shipping SMS</Button></section>
  <section class="space-y-3"><h2 class="text-xl font-semibold">Recent Messaging Audit</h2>{#each records as record (record.id)}<article class="rounded-lg border bg-card p-4"><strong>{record.event}</strong><time class="float-right text-xs">{new Date(record.createdAt).toLocaleString()}</time><pre class="mt-3 overflow-x-auto bg-muted p-3">{JSON.stringify(record.metadata, null, 2)}</pre></article>{:else}<p class="rounded-lg border border-dashed p-8">No Messaging audit events yet.</p>{/each}</section>
</main>
```

## 4. Register Messaging

In `src/routes/index.ts`, insert this immediately before `// bunway:imports`:

```ts
import { messagingShowcaseRoutes } from './messaging'
```

Insert this immediately before `// bunway:routes`:

```ts
.use(messagingShowcaseRoutes)
```

In `web/src/lib/resources.ts`, insert this immediately before `// bunway:resources`:

```ts
{ label: 'Messaging Showcase', href: '/examples/messaging', icon: 'chat' },
```

Restart `bunway dev`. On macOS/Linux, copy and paste:

```sh
curl --silent --fail-with-body --request POST http://localhost:3000/examples/messaging/mail --header 'content-type: application/json' --data-raw '{"to":"demo@bunway.test","subject":"Bunway Mail","text":"Hello from the Showcase"}'
curl --silent --fail-with-body --request POST http://localhost:3000/examples/messaging/sms --header 'content-type: application/json' --data-raw '{"to":"+15555550100","text":"Hello from Bunway SMS"}'
curl --silent --fail-with-body http://localhost:3000/examples/messaging/audit
```

On Windows PowerShell, copy and paste:

```powershell
curl.exe --silent --fail-with-body --request POST http://localhost:3000/examples/messaging/mail --header "content-type: application/json" --data-raw '{"to":"demo@bunway.test","subject":"Bunway Mail","text":"Hello from the Showcase"}'
curl.exe --silent --fail-with-body --request POST http://localhost:3000/examples/messaging/sms --header "content-type: application/json" --data-raw '{"to":"+15555550100","text":"Hello from Bunway SMS"}'
curl.exe --silent --fail-with-body http://localhost:3000/examples/messaging/audit
```

Next: [add Jobs and Realtime](./04-jobs-realtime.md).
