---
title: Troubleshooting
---

# Troubleshooting

## `bunway` is not found

Run through Bun (`bunx bunway help`) or install `@bunway/cli` globally. Confirm Bun's global bin path is
on `PATH`.

## Database connection or migration fails

Check `.env`, run `bunway db:list`, and ensure the selected server exists. Use
`bunway db:migrate --database=name`; `--all` stops at the first failure and is not a distributed
transaction.

## Generator says a file exists

Generators intentionally do not overwrite application code. Rename/remove the collision only after
reviewing it, or edit the existing source manually.

## Worker does not process jobs

Run migrations so `bunway_jobs` exists, import every definition from `src/jobs/index.ts`, and verify
`BUNWAY_JOBS_DATABASE` selects PostgreSQL. If `QUEUES` is set, it must include the enqueued queue.

## SSE is connected but does not update

Disable reverse-proxy buffering. The publisher and connection must currently be in the same Bun process.
The same constraint applies to Job progress emitted from a separate worker.

## WebSocket does not connect

Forward HTTP/1.1 upgrade headers, use `wss:` behind HTTPS, and confirm the channel query value. Bunway's
browser helper does not add automatic WebSocket reconnection in v0.1.

## OAuth provider is missing or callback mismatches

Set both provider credentials, restart the API, and register the exact
`<BETTER_AUTH_URL>/api/auth/callback/<provider>` URL. Development disables providers with missing values.

## Mail/SMS stays in the console

That is the safe development default. Set a supported driver and all required provider variables.
Production never permits console delivery. `sendLater()` additionally requires migrations and a worker.

## Upload is saved but inaccessible

Check `STORAGE_PUBLIC_URL`, the `/storage` route, filesystem permissions, and proxy upload size. For S3,
verify endpoint, region, bucket credentials, and that the public URL can actually serve the object.

Set `DEBUG=1` only when a CLI failure needs its unexpected stack trace; ordinary user errors are concise.
