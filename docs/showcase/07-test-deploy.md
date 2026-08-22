---
title: 7. Test, build, and deploy
---

# 7. Test, build, and deploy

```sh
bun test
bun run typecheck
bun run build
bunway routes
```

Exercise CRUD, upload/download, a queued job, same-process progress, WebSocket chat, password sign-in,
TOTP, an Audit query, immediate console delivery, and queued console delivery. OAuth requires real
credentials.

For production, apply migrations once, supervise app and worker with systemd, and proxy through Nginx
with WebSocket upgrades and buffering disabled for SSE. Follow [Deploy to a VPS](../deployment.md) and
the [production checklist](../production-checklist.md).

## What you built

- Elysia + Drizzle resources and an Eden/SvelteKit UI
- relationships and local/S3-compatible attachments
- PostgreSQL Jobs, SSE progress, and WebSocket communication
- Better Auth password identity, OAuth integration points, TOTP, and backup codes
- append-only Audit history and immediate/queued Mail/SMS

Messaging may use Jobs and Audit; it does not require Realtime. Audit does not enqueue or publish.
Realtime is transient. Jobs are durable execution.

:::tip Final verification
Repeat migrations and this smoke path against a fresh database. The tutorial contains no pre-existing
showcase files or hidden seed requirement.
:::
