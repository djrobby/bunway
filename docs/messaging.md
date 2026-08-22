---
title: Messaging
---

# Transactional Mail and SMS

Bunway Messaging sends transactional email and SMS without becoming a campaign or communications platform.

```text
mail.send() / sms.send()           deliver now
mail.sendLater() / sms.sendLater() enqueue with Bunway Jobs
Audit                              records durable outcomes
Realtime                           optional connected-browser updates
```

Messaging depends on Jobs for queued work and may record Audit outcomes. It does not automatically publish Realtime events. It does not provide campaigns, mailing lists, a second queue, or message-history storage.

## Generate definitions

```sh
bunway g mailer Order confirmation shipped
bunway g sms Order shipped
```

The first Messaging generator also installs Audit when absent, creates `src/messaging/index.ts`, registers its two ordinary Jobs, and adds provider variables to `.env.example`. Run `bunway db:migrate` after generation. Definitions are optional organization; direct sending always remains available.

## Email

```ts
const result = await mail.send({
  to: ["customer@example.com", "accounts@example.com"],
  from: "Orders <orders@example.com>",
  replyTo: "support@example.com",
  cc: "manager@example.com",
  bcc: "archive@example.com",
  subject: "Your quote is ready",
  text: "Quote Q-1001 is ready.",
  html: "<h1>Your quote is ready</h1>",
  headers: { "X-Reference": "Q-1001" },
});
```

Results are small: `{ id, status: 'sent', provider }`. Development console delivery returns `status: 'logged'`. Provider and Audit failures throw.

Attachments accept a `Blob`, `ArrayBuffer`, `Uint8Array`, or base64 string:

```ts
attachments: [
  {
    filename: "invoice.pdf",
    data: Bun.file(path),
    contentType: "application/pdf",
  },
];
```

Attachments are base64-serialized before queued delivery. Bunway intentionally has no email template language; use ordinary TypeScript to produce `text` and `html`.

## Mailers

Generated code is immediately compilable and editable:

```ts
export type OrderMessage = { to: string; reference: string };

export const orderMailer = mailer({
  confirmation: ({ to, reference }: OrderMessage) => ({
    to,
    subject: `Order ${reference} confirmed`,
    text: `Order ${reference} has been confirmed.`,
  }),
});
```

```ts
await orderMailer
  .confirmation({ to: order.email, reference: order.number })
  .send();
await orderMailer
  .confirmation({ to: order.email, reference: order.number })
  .sendLater();
```

## SMS

SMS intentionally sends one transactional message to one destination:

```ts
await sms.send({
  to: "+15555550100",
  text: "Your verification code is 472921.",
});
```

```ts
export const orderSms = sms.define({
  shipped: ({ to, reference }: OrderMessage) => ({
    to,
    text: `Order ${reference} has shipped.`,
  }),
});

await orderSms
  .shipped({ to: order.phone, reference: order.number })
  .sendLater();
```

## Background delivery

`sendLater()` calls the generated `bunway-mail-delivery` or `bunway-sms-delivery` Job. It returns the existing bigint Job ID and accepts existing Job options:

```ts
await mail.sendLater(message, {
  queue: "mail",
  maxAttempts: 5,
  runAt: new Date(Date.now() + 5 * 60_000),
  audit: { subject: { type: "order", id: order.id } },
});
```

Run `bunway worker` normally. Provider exceptions use existing Job retries; Messaging has no retry engine. Temporary retries do not generate repeated failed Audit records. The test showcase runs one worker iteration in the API process so the existing process-local Realtime broker can visibly report genuine Job progress.

## Development

No external service is needed. With no explicit driver outside production, Mail and SMS print their destination and content to the Bun server console and return `logged`. Audit records `mail.logged` or `sms.logged`, accurately indicating no external delivery occurred.

In production, missing configuration or a console driver throws. Password resets, magic links, and OTPs are never silently discarded or presented as delivered.

## Providers

### Resend

Resend uses Bun's native `fetch()`; no Resend SDK is installed.

```dotenv
MAIL_DRIVER=resend
RESEND_API_KEY=
MAIL_FROM=Orders <orders@example.com>
```

The driver supports the documented fields and base64 attachments. Resend currently limits a complete email to 40 MB after base64 encoding.

### SMTP

SMTP uses Nodemailer because Bun and Web APIs do not provide an SMTP client.

```dotenv
MAIL_DRIVER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_SECURE=false
MAIL_FROM=Orders <orders@example.com>
```

Use `SMTP_SECURE=true` for implicit TLS, normally port 465. Port 587 normally upgrades with STARTTLS.

### Twilio SMS

Twilio uses Bun's native `fetch()` with the current form-encoded Messages API; no Twilio SDK is installed.

```dotenv
SMS_DRIVER=twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=+15555550101
```

The normalized ID is Twilio's Message SID. Delivery-receipt webhook processing is intentionally deferred.

## Audit and authentication

Messaging records `mail.logged`, `mail.sent`, `mail.failed`, `sms.logged`, `sms.sent`, and `sms.failed`. Metadata contains recipient, provider, provider message ID, email subject, and a bounded safe error where applicable. It never automatically contains text/HTML, SMS bodies, attachments, OTPs, magic links, or reset tokens.

Generated Better Auth magic links and email OTP/MFA callbacks use the same `mail.send()`. Development content appears through the console driver while Audit stores only outcome metadata. There is no duplicate Auth mail transport.

Svelte email rendering, marketing mail, inbound communication, provider webhooks, full delivery history, and retention are deferred.
