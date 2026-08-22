---
title: 6. Add Audit, Mail, and SMS
---

# 6. Add Audit, Mail, and SMS

```sh
bunway g audit
bunway g mailer Listing published
bunway g sms Listing published
bunway db:migrate
```

```ts
await audit.record('listing.published', {
  actor: { type: 'user', id: user.id },
  subject: { type: 'listing', id: listing.id },
  metadata: { title: listing.title },
})

await listingMailer.published({ to: email, reference: listing.title }).send()
await listingSms.published({ to: phone, reference: listing.title }).sendLater({
  audit: { subject: { type: 'listing', id: listing.id } },
})
```

Outside production, absent providers print to the Bun console and return `logged`; Audit accurately
stores `mail.logged` or `sms.logged`. `sendLater()` uses generated delivery Jobs and requires a worker.
Query history with ordinary Drizzle—Audit intentionally has no query model.

:::tip Verify it
Send one message now and one later. Check the console, run the worker, and query `audit_logs`. You should
see `listing.published` and delivery outcomes. Message bodies and auth tokens are not persisted.
:::

Production requires Resend or SMTP and Twilio if SMS is used. Messaging does not publish Realtime
automatically. Next: [test and deploy](./07-test-deploy.md).
