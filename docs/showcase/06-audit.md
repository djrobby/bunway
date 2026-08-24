---
title: 7. Build the Audit showcase
---

# 7. Build the Audit showcase

Messaging already generated Audit. Running the command again is safe and makes this chapter usable on
its own:

```sh
bunway g audit
bunway db:migrate
```

## 1. Create the Audit API

Create `src/routes/audit.ts` with this complete file:

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

## 2. Create the Audit page

Create `web/src/routes/examples/audit/+page.svelte` with this complete file:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { authClient } from '$lib/auth-client'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Textarea } from '$lib/components/ui/textarea/index.js'

  type AuditLog = {
    id: string; event: string; actorType: string | null; actorId: string | null
    subjectType: string | null; subjectId: string | null
    metadata: Record<string, unknown> | null; createdAt: string
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
    try { values = JSON.parse(metadata) }
    catch { message = 'Metadata must be valid JSON.'; return }
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
    if (!response.ok) { message = await response.text(); return }
    records = (await response.json()).records
    message = 'Durable audit event recorded.'
  }

  async function recordAuthenticated() {
    const response = await fetch(`${endpoint}/authenticated`, { method: 'POST', credentials: 'include' })
    if (!response.ok) { message = 'Sign in before recording an authenticated event.'; return }
    records = (await response.json()).records
    message = 'Authenticated event recorded.'
  }

  function useSanitizationExample() {
    event = 'integration.connected'
    metadata = JSON.stringify({ provider: 'demo', accessToken: 'secret', nested: { password: 'secret', safe: 'visible' } }, null, 2)
  }
  onMount(load)
</script>

<svelte:head><title>Bunway Audit</title></svelte:head>
<main class="w-full min-w-0 space-y-8 px-4 py-8 sm:px-6 lg:px-8">
  <header><p class="text-sm uppercase tracking-wide text-muted-foreground">Durable application facts</p><h1 class="text-3xl font-semibold">Bunway Audit</h1></header>
  <div class="grid gap-8 lg:grid-cols-2">
    <section class="space-y-5 rounded-lg border bg-card p-6 shadow-sm">
      <h2 class="text-xl font-semibold">Record an audit event</h2>
      <label>Event <Input bind:value={event} /></label>
      <div class="grid gap-4 sm:grid-cols-2"><label>Actor type <Input bind:value={actorType} /></label><label>Actor ID <Input bind:value={actorId} /></label><label>Subject type <Input bind:value={subjectType} /></label><label>Subject ID <Input bind:value={subjectId} /></label></div>
      <label>Metadata JSON <Textarea class="min-h-48 font-mono" bind:value={metadata} /></label>
      <div class="flex flex-wrap gap-3"><Button onclick={record}>Record event</Button><Button variant="outline" onclick={useSanitizationExample}>Load redaction example</Button></div>
      <p class="text-sm">{$session.data ? `Signed in as ${$session.data.user.email}` : 'Not signed in'}</p>
      <Button variant="outline" onclick={recordAuthenticated}>Record authenticated event</Button>
      {#if message}<p class="rounded-md bg-muted p-3">{message}</p>{/if}
    </section>
    <section class="space-y-4"><h2 class="text-xl font-semibold">Recent audit events</h2>
      {#each records as record (record.id)}<article class="rounded-lg border bg-card p-5 shadow-sm"><strong class="font-mono">{record.event}</strong><time class="float-right text-xs">{new Date(record.createdAt).toLocaleString()}</time><p>Actor: {record.actorType ? `${record.actorType}:${record.actorId ?? '—'}` : '—'}</p><p>Subject: {record.subjectType ? `${record.subjectType}:${record.subjectId ?? '—'}` : '—'}</p>{#if record.metadata}<pre class="overflow-x-auto bg-muted p-3">{JSON.stringify(record.metadata, null, 2)}</pre>{/if}</article>{:else}<p class="rounded-lg border border-dashed p-8">No audit events yet.</p>{/each}
    </section>
  </div>
</main>
```

## 3. Register Audit

In `src/routes/index.ts`, insert this immediately before `// bunway:imports`:

```ts
import { auditShowcaseRoutes } from './audit'
```

Insert this immediately before `// bunway:routes`:

```ts
.use(auditShowcaseRoutes)
```

In `web/src/lib/resources.ts`, insert this immediately before `// bunway:resources`:

```ts
{ label: 'Audit Showcase', href: '/examples/audit', icon: 'receipt' },
```

Restart `bunway dev`. On macOS/Linux, copy and paste:

```sh
curl --silent --fail-with-body --request POST http://localhost:3000/examples/audit --header 'content-type: application/json' --data-raw '{"event":"order.approved","actor":{"type":"demo","id":"curl"},"subject":{"type":"order","id":"DEMO-1001"},"metadata":{"source":"showcase tutorial"}}'
curl --silent --fail-with-body http://localhost:3000/examples/audit
```

On Windows PowerShell, copy and paste:

```powershell
curl.exe --silent --fail-with-body --request POST http://localhost:3000/examples/audit --header "content-type: application/json" --data-raw '{"event":"order.approved","actor":{"type":"demo","id":"curl"},"subject":{"type":"order","id":"DEMO-1001"},"metadata":{"source":"showcase tutorial"}}'
curl.exe --silent --fail-with-body http://localhost:3000/examples/audit
```

Next: [test, build, and deploy](./07-test-deploy.md).
