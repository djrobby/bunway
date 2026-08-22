---
title: Generators
---

# Generators reference

All generators support the `generate` and `g` command forms. They refuse to overwrite generated files.

| Generator | Purpose | Principal output |
| --- | --- | --- |
| `model` | Database schema only | `src/db[/name]/schema/<table>.ts` |
| `resource` | Schema, validated API, test | schema, route, test |
| `scaffold` | Resource plus SvelteKit UI | resource output plus list/detail pages |
| `job` | Durable async work | `src/jobs/<name>.ts` |
| `realtime` | SSE or WebSocket recipe | `src/realtime/<name>.ts` and route wiring |
| `auth` | Better Auth integration | auth schema, plugin, pages, protected route |
| `audit` | Durable audit events | audit schema, recorder, sanitizer |
| `mailer` | Named email builders | `src/mailers/<name>.ts` |
| `sms` | Named SMS builders | `src/sms/<name>.ts` |

For field syntax and resource output, see [Resources and scaffolding](./scaffolding.md). For every flag,
see the [CLI reference](./cli.md). Generator edits are explicit: schema and route barrel files, the job
registry, app composition, and frontend resource navigation are updated rather than discovered at runtime.
