---
title: 4. Add Jobs and Realtime
---

# 4. Add Jobs and Realtime

```sh
bunway g job ProcessDemoFile
bunway g realtime progress ProcessDemoFile
bunway g realtime chat Showcase
bunway db:migrate
```

Edit the generated handler:

```ts
export const processDemoFile = job('process-demo-file', async (_payload: {}, { progress }) => {
  for (const [percent, message] of [[10, 'Loading file'], [35, 'Analyzing'], [65, 'Processing'], [90, 'Generating result'], [100, 'Complete']] as const) {
    await Bun.sleep(250)
    await progress(percent, message)
  }
})
```

These commands create a Job and channel definitions. They intentionally do **not** invent a demo page
or navigation item. To match the test app, compose a `/realtime` page from them and add this entry to
`web/src/lib/resources.ts` before `// bunway:resources`:

```ts
{ label: 'Realtime Showcase', href: '/realtime', icon: 'chat' },
```

Create `web/src/routes/realtime/+page.svelte`. Subscribe with
`realtime.job('process-demo-file', handler)`, connect chat with
`realtime.connect('chat:showcase')`, and provide controls that call an ordinary Elysia route. Create
that route under `src/routes/realtime.ts`, run
`processDemoFile.performNow({}, { id: 'process-demo-file' })` for visible same-process progress, and
register the route explicitly from `src/routes/index.ts`. The maintained test-app page composes generic
notifications, status, Job progress, a dashboard, and chat from these same primitives.

For durable independent execution, enqueue with `processDemoFile.performLater({})`, then run
`bunway worker`. SSE fits server-to-browser progress; WebSockets fit chat because the browser sends and
receives.

:::warning Current preview limitation
Realtime uses an in-memory broker. A separate worker cannot publish progress to an API-process client.
Use `performNow()` or `workOnce()` in the API process for the visible demo; retain `performLater()` and
the worker for durable execution.
:::

:::tip Verify it
Open `/realtime` in two windows. Confirm its sidebar link, same-process progress, and chat. If the route
does not exist, only the primitives were generated—the page, route, and navigation composition above is
still missing.
:::

Next: [add Authentication](./05-auth.md).
