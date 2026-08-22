---
sidebar_position: 8
title: Background jobs
---

# Background jobs

Bunway jobs are a deliberately small runtime abstraction backed by PostgreSQL.

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

Start workers with `bunway worker`. Workers use PostgreSQL row locking with `FOR UPDATE SKIP LOCKED` so
multiple processes can safely claim work. The queue records attempts, failures, completion, optional
queue names, and retry timing without requiring Redis or another service.

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
`BUNWAY_JOBS_DATABASE=queue` reads `QUEUE_DATABASE_URL`. The selected connection must be PostgreSQL;
MySQL, SQLite, and PocketBase application databases do not provide the queue's locking semantics.
