---
sidebar_position: 8
title: Background jobs
---

# Background jobs

Bunway jobs are a deliberately small runtime abstraction with two interchangeable drivers behind the
same API: PostgreSQL for durable queueing, and an in-memory driver when no jobs database is
configured. The active driver is announced at startup; it is never silently chosen.

```sh
bunway g job ProcessOrder
```

```ts
export const processOrder = job(
  "process-order",
  async ({ orderId }: { orderId: string }) => {
    // application work
  },
);
```

Run immediately or enqueue:

```ts
await processOrder.performNow({ orderId });
await processOrder.performLater({ orderId });
```

Start workers with `bunway worker`. With PostgreSQL configured, workers use row locking with
`FOR UPDATE SKIP LOCKED` so multiple processes can safely claim work. The queue records attempts,
failures, completion, optional queue names, and retry timing without requiring Redis or another
service. Retries back off by `attempt * 5 seconds`.

Without a jobs database, jobs run on the in-memory driver: the same `job()` API and retry semantics,
but process-local and non-durable by design — enqueued work lives only in that one process. This is
convenient for development, tests, and database-free projects; production deployments should configure
PostgreSQL jobs. A warning is logged when the in-memory driver is selected in production.

Job definitions must be explicitly imported by the generated job registry. Workers use the same
application code and database configuration as the API.

Messaging reuses this queue instead of introducing a Mail or SMS queue:

```ts
await orderMailer
  .confirmation({ to: order.email, reference: order.number })
  .sendLater();
```

Provider errors use the normal retry lifecycle. Messaging records one final failed Audit outcome rather than duplicating intermediate retries.

Jobs use the named database in `BUNWAY_JOBS_DATABASE` (default `primary`). For example,
`BUNWAY_JOBS_DATABASE=queue` reads `QUEUE_DATABASE_URL`. When that variable is unset, the in-memory
driver takes over. The selected connection must be PostgreSQL; MySQL and SQLite application databases
do not provide the queue's locking semantics.
