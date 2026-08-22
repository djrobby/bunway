---
title: Project structure
---

# Project structure

```text
src/
├── app.ts                 Elysia composition and exported App type
├── db/
│   ├── config.ts          named database declarations
│   ├── index.ts           Drizzle or PocketBase clients
│   ├── schema/            primary Drizzle schema
│   └── migrations/        primary Drizzle Kit SQL
├── routes/                composable Elysia route modules
├── jobs/                  job definitions and explicit registry
├── realtime/              generated typed channels
├── auth/                  generated Better Auth integration, when selected
├── audit/                 generated durable audit recorder, when selected
├── messaging/             Mail/SMS drivers and delivery jobs, when selected
├── mailers/ and sms/      application message definitions
└── storage.ts             local or S3-compatible object storage
web/                       ordinary SvelteKit 2 / Svelte 5 application
tests/                     Bun tests
drizzle.config.ts          primary Drizzle Kit configuration
.env.example               safe configuration inventory
```

Additional SQL databases live at `src/db/<name>/schema` and `src/db/<name>/migrations`, with a matching
`drizzle.<name>.config.ts`. PocketBase instead owns collections and migrations.

## Generated code is yours

**Bunway generates ordinary application code. You own it. Edit it.** Route files use Elysia, schemas
use Drizzle, the browser uses SvelteKit and Eden Treaty, and registrations are explicit. There is no
hidden filesystem discovery. If Bunway disappeared, the generated application would remain readable.

Use Elysia directly for HTTP, Drizzle or Bun.SQL directly for data, and SvelteKit directly for frontend
behavior. Bunway runtime code is reserved for capabilities the stack does not already provide cleanly:
Jobs, Realtime channels, Storage adapters, and Messaging delivery.
