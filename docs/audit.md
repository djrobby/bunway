---
title: Audit logging
---

# Audit logging

Bunway Audit stores durable, meaningful application and security events. It answers **what meaningful action or outcome occurred?** It does not capture every technical detail.

| Capability       | Use it for                                                                   |
| ---------------- | ---------------------------------------------------------------------------- |
| Audit            | Durable facts such as `order.approved`, `auth.mfa_enabled`, or `mail.failed` |
| Application logs | Startup, debugging, errors, stack traces, and operational diagnostics        |
| Access logs      | HTTP methods, paths, response codes, and timing                              |
| Analytics        | Page views, funnels, and product behavior                                    |
| Realtime         | Transient delivery to currently connected clients                            |
| Jobs             | Work that should execute now or later                                        |

Audit is not an event bus. Nothing subscribes to audit records and `audit.record()` never triggers application behavior. Perform the business action and its side effects explicitly, then record the fact.

## Quick start

```sh
bunway g audit
bunway db:migrate
```

The generator creates ordinary application-owned code:

```text
src/audit/index.ts
src/audit/sanitize.ts
src/db/schema/audit-logs.ts
```

Record an event:

```ts
import { audit } from "./audit";

await audit.record("order.approved", {
  actor: { type: "user", id: user.id },
  subject: { type: "order", id: order.id },
  metadata: { amount: order.total },
});
```

Metadata, actor, and subject are optional:

```ts
await audit.record("system.started", {
  actor: { type: "system" },
});
```

Event and reference types are open dot/identifier-style strings. There is no registry or enum. Actor and subject IDs accept strings, numbers, and bigints and are stored as strings so polymorphic references remain portable across Bunway databases.

## Query with Drizzle

Bunway records; Drizzle queries. There is intentionally no Audit model or query API:

```ts
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { auditLogs } from "./db/schema/audit-logs";

const history = await db
  .select()
  .from(auditLogs)
  .where(
    and(
      eq(auditLogs.subjectType, "order"),
      eq(auditLogs.subjectId, String(order.id)),
    ),
  )
  .orderBy(desc(auditLogs.createdAt));
```

The append-only `audit_logs` table contains `id`, `event`, optional actor type/ID, optional subject type/ID, optional metadata, and `created_at`. It has practical history indexes on `(event, created_at)`, `(actor_type, actor_id, created_at)`, and `(subject_type, subject_id, created_at)`. Metadata is not indexed by default and there is no `updated_at`.

PostgreSQL uses JSONB, MySQL uses JSON, and SQLite uses Drizzle JSON-mode text. Audit IDs follow the generator's normal UUID/integer/bigint selection.

## Sensitive metadata

Metadata is recursively copied and obvious sensitive keys are replaced with `[REDACTED]`. Matching ignores case and separators such as `_` and `-`. Protected categories include:

```text
passwords and password hashes
tokens, access tokens, refresh tokens, and session tokens
authorization and cookie headers
secrets and client secrets
API keys
OTPs and MFA secrets
recovery codes
authentication/MFA verification codes
```

Nested objects and objects inside arrays are sanitized without changing the caller's object:

```ts
{
  provider: 'demo',
  accessToken: 'super-secret',
  nested: { password: 'also-secret', safe: 'visible' },
}

// stored metadata
{
  provider: 'demo',
  accessToken: '[REDACTED]',
  nested: { password: '[REDACTED]', safe: 'visible' },
}
```

Sanitization is a safety net, not permission to store arbitrary requests, headers, sessions, or authentication objects. Record only the small set of values that explains the event. Never place credentials in the event, actor ID, or subject ID.

## Named databases

Audit uses `primary` unless generated for an existing named Drizzle database:

```sh
bunway db:add audit --adapter=postgres
bunway g audit --database=audit
bunway db:migrate --database=audit
```

A larger application can keep `primary` for business data, `queue` for Jobs, and `audit` for audit history. The generated `src/audit/index.ts` imports that selected connection directly; it does not introduce another database configuration layer.

## Transactions and failures

Recording writes immediately and throws database failures. Applications decide whether failure should abort the surrounding action. Pass a Drizzle transaction explicitly when the business data and Audit use the same database:

```ts
await db.transaction(async (tx) => {
  const [order] = await tx
    .update(orders)
    .set({ status: "approved" })
    .returning();

  await audit.record(
    "order.approved",
    {
      subject: { type: "order", id: order.id },
    },
    { db: tx },
  );
});
```

If business data and Audit use different named databases, they cannot share an atomic transaction. Bunway does not fake distributed transactions, silently swallow failures, queue records through Jobs, or add a fallback store.

## Authentication

Audit works without Better Auth and does not use hidden request state. Pass authenticated actors explicitly:

```ts
await audit.record("order.approved", {
  actor: { type: "user", id: user.id },
  subject: { type: "order", id: order.id },
});
```

For system work, use `{ type: 'system' }` without an ID. Bunway does not automatically audit session reads, cookie refreshes, or protected requests. The test application separately demonstrates an authenticated Audit endpoint using the existing Elysia auth context.

## Jobs, Realtime, and Messaging

Jobs mean “send this email later”; Audit means “the email was sent.” Audit recording is a direct insert, not a Job. Likewise, Audit is durable history while Realtime is transient delivery. An application may explicitly call both after a business action, but Audit itself never publishes.

Bunway Messaging records `mail.logged`, `mail.sent`, `mail.failed`, `sms.logged`, `sms.sent`, and `sms.failed`. Metadata is limited to recipient, email subject, provider, provider message ID, and a bounded safe error. Text/HTML, SMS bodies, attachments, OTPs, magic links, reset links, and authentication secrets are never automatically persisted.

## Retention and privacy

Audit history grows until the application archives or removes it. Bunway does not impose a retention scheduler. Choose retention based on business, privacy, and legal requirements; a future application-specific Bunway Job can implement that policy.

Audit records may contain personal information. Record only necessary metadata, avoid secrets and request payloads, define a retention policy, and consider the requirements that apply to your application. Bunway makes no legal or compliance guarantees.
