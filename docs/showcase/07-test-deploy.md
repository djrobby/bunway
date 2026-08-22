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

## Parity checklist

The maintained test app and this guide share these visible destinations:

- `/categories` and `/products` for the core relationship/attachment example
- `/users`, `/tags`, `/posts`, and `/comments` for the publishing model
- `/blog` for the composed publishing read experience
- `/realtime` for the explicitly composed Job/SSE/WebSocket demo
- `/login`, `/register`, `/account`, and `/account/security` for Auth
- `/examples/audit` and `/examples/messaging` for the operational demos

Each non-Auth destination has an explicit entry in `web/src/lib/resources.ts`. Auth is contextual in
the sidebar footer. Jobs have no standalone link: progress appears at `/realtime`, while queued message
delivery appears at `/examples/messaging`.

Messaging may use Jobs and Audit; it does not require Realtime. Audit does not enqueue or publish.
Realtime is transient. Jobs are durable execution.

:::tip Final verification
Repeat migrations and this smoke path against a fresh database. The tutorial contains no unexplained
extra resource model, hidden route discovery, pre-existing showcase file, or hidden seed requirement.
:::
