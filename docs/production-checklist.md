---
title: Production checklist
---

# Production checklist

- Set `NODE_ENV=production`, origins, and a strong `BETTER_AUTH_SECRET` when Auth is installed.
- Configure every database URL and run `bunway db:migrate --all` for SQL databases.
- Run `bun test`, `bun run typecheck`, and `bun run build`.
- Put the app behind HTTPS and forward SSE, WebSocket, host, protocol, and client IP headers.
- Run and monitor `bunway worker` when Jobs or `sendLater()` are used.
- Configure real Mail/SMS providers; console delivery deliberately fails in production.
- Configure production OAuth callback URLs and passkey RP/origin values.
- Use persistent local storage or S3-compatible shared storage; set upload limits.
- Keep `.env` out of source control, restrict its permissions, and rotate provider credentials.
- Account for the current single-process Realtime limitation in process topology.
- Define backup, restore, audit-retention, and log-retention procedures appropriate to the application.
