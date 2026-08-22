---
title: 4. Add Jobs and Realtime
---

# 4. Add Jobs and Realtime

```sh
bunway g job ProcessListingImage
bunway g realtime progress ProcessListingImage
bunway g realtime chat SupportRoom
bunway db:migrate
```

Edit the generated handler:

```ts
export const processListingImage = job(
  'process-listing-image',
  async ({ listingId }: { listingId: string }, { progress }) => {
    await progress(10, 'Loading image')
    // Query the Listing with Drizzle and process its attachment.
    await progress(70, 'Creating preview')
    await progress(100, `Listing ${listingId} is ready`)
  },
)
```

Enqueue with `const jobId = await processListingImage.performLater({ listingId })`, then run
`bunway worker`. SSE fits server-to-browser progress; WebSockets fit support chat because the browser
sends and receives.

:::warning Current preview limitation
Realtime uses an in-memory broker. A separate worker cannot publish progress to an API-process client.
Use `performNow()` or `workOnce()` in the API process for the visible demo; retain `performLater()` and
the worker for durable execution.
:::

:::tip Verify it
Inspect job completion, then open the generated chat experience in two windows. Confirm same-process SSE
reports running and completed states.
:::

Next: [add Authentication](./05-auth.md).
