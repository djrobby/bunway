---
title: 6. Add Audit, Mail, and SMS
---

# 6. Add Audit, Mail, and SMS

```sh
bunway g audit
bunway g mailer Order confirmation
bunway g sms Order shipped
bunway db:migrate
```

These generators install application primitives; they do not assume a presentation. To match the test
app, create `web/src/routes/examples/audit/+page.svelte` and
`web/src/routes/examples/messaging/+page.svelte`, compose their ordinary Elysia endpoints in
`src/routes/audit.ts` and `src/routes/messaging.ts`, register both from `src/routes/index.ts`, and add
the following before `// bunway:resources` in `web/src/lib/resources.ts`:

```ts
{ label: 'Audit Showcase', href: '/examples/audit', icon: 'receipt' },
{ label: 'Messaging Showcase', href: '/examples/messaging', icon: 'chat' },
```

The Audit page records and queries recent events with Drizzle. The Messaging page calls the generated
Mail/SMS definitions and displays immediate and queued results. This is the presentation boundary used
by `bunway-test-app`.

```ts
await audit.record('product.published', {
  actor: { type: 'user', id: user.id },
  subject: { type: 'product', id: product.id },
  metadata: { name: product.name },
})

await orderMailer.confirmation({ to: email, reference: product.name }).send()
await orderSms.shipped({ to: phone, reference: product.name }).sendLater({
  audit: { subject: { type: 'product', id: product.id } },
})
```

Outside production, absent providers print to the Bun console and return `logged`; Audit accurately
stores `mail.logged` or `sms.logged`. `sendLater()` uses generated delivery Jobs and requires a worker.
Query history with ordinary Drizzle—Audit intentionally has no query model.

:::tip Verify it
Open `/examples/audit` and `/examples/messaging` from the sidebar. Send one message now and one later.
Check the console, run the worker, and query `audit_logs`. You should
see `product.published` and delivery outcomes. Message bodies and auth tokens are not persisted.
:::

Production requires Resend or SMTP and Twilio if SMS is used. Messaging does not publish Realtime
automatically. Next: [test and deploy](./07-test-deploy.md).
