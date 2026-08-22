---
slug: /showcase
title: Build the Bunway Showcase
---

# Build the Bunway Showcase

Build the same publishing and operations application exercised by Bunway's real `bunway-test-app`. You will compose CRUD,
relationships, attachments, SSE and WebSockets, Better Auth, Audit, Mail, and SMS on PostgreSQL,
MySQL, or SQLite. PostgreSQL additionally demonstrates durable Jobs and workers.

This is a reproducible build guide, not a tour of unrelated examples. The final application uses the
same named surfaces as the maintained test app: Products, Categories, the Blog, Realtime, Auth, Audit,
and Messaging. Generated files and hand-composed demo pages are identified explicitly; nothing appears
through hidden route discovery.

| Step | You will build |
| --- | --- |
| 1 | project, database, and mental model |
| 2 | Category and validated Product CRUD, relationship, attachment, and SvelteKit UI |
| 3 | the Users, Posts, Comments, and Tags publishing model |
| 4 | `/realtime` SSE/WebSocket demo and sidebar link; PostgreSQL durable processing |
| 5 | password Auth, OAuth setup, TOTP, backup codes, protected routes |
| 6 | `/examples/audit` and `/examples/messaging`, with sidebar links |
| 7 | tests, production build, and deployment plan |

The tutorial requires Bun and one supported database: PostgreSQL (default), MySQL, or SQLite. Jobs and
queued Mail/SMS require PostgreSQL; every other Showcase surface runs on all three. Third-party OAuth,
Mail, and SMS accounts are optional: development guidance and console delivery let you complete the
local path without them.

Restart `bunway dev` after adding routes or changing environment variables. Resource scaffolds add
themselves to `web/src/lib/resources.ts`; Jobs and Realtime do not imply a UI, so their showcase pages
are registered explicitly in this guide.

Start with [1. Create and understand the app](./01-create.md).
