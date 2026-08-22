---
sidebar_position: 3
title: CLI reference
---

# CLI reference

| Command | Syntax summary |
| --- | --- |
| Version | `bunway --version`, `bunway -v` |
| Create | `bunway new <name> [--no-install] [--api-only] [--database=postgres\|mysql\|sqlite]` |
| Develop | `bunway dev`, `bunway routes`, `bunway console` / `c` |
| Generate | `bunway generate` / `g <kind> ...` |
| Database | `bunway db:add`, `db:list`, `db:migrate` |
| Jobs | `bunway worker` |

`<name>` is required for project and named-definition generators. Application names use letters,
numbers, hyphens, and underscores and must begin with a letter. Generator names are normalized into
ordinary singular/plural TypeScript, file, route, and table names.

## Realtime recipes

```sh
bunway g realtime notifications
bunway g realtime status Order
bunway g realtime progress ProcessOrder
bunway g realtime chat Room
bunway g realtime custom Activity --transport=sse
```

With no recipe, `bunway g realtime` prompts interactively. Fully specified commands never prompt and
are preferred for scripts and coding agents.

## Projects and development

| Command                                        | Purpose                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| `bunway new <name>`                            | Create an application.                                           |
| `bunway --version`, `bunway -v`                | Print the installed Bunway CLI version.                          |
| `bunway new <name> --no-install`               | Create without running `bun install`.                            |
| `bunway new <name> --database=<adapter>`       | Select the primary adapter; default `postgres`.                  |
| `bunway new <name> --api-only`                 | Create an API application without SvelteKit.                     |
| `bunway dev`                                   | Start the Elysia API and SvelteKit development server.           |
| `bunway routes`                                | Print registered Elysia methods and paths.                       |
| `bunway db:add <name> --adapter=<adapter>`     | Add a named PostgreSQL, MySQL, or SQLite connection. |
| `bunway db:list`                               | List configured databases without credentials.                   |
| `bunway db:migrate [--database=<name>\|--all]` | Generate and apply migrations for selected SQL databases.        |
| `bunway worker`                                | Start the PostgreSQL job worker.                                 |
| `bunway console`, `bunway c`                   | Start an application-aware Bun REPL.                             |

## Generators

```sh
bunway g model User name:string email:string:unique
bunway g resource Customer name:string active:boolean
bunway g scaffold Product name:string price:decimal image:image:optional
bunway g job ImportProducts
bunway g auth --password --oauth=google,github --mfa=totp,backup-codes
bunway g audit --database=audit
bunway g mailer Order confirmation shipped
bunway g sms Order shipped
```

`model` generates and registers a Drizzle schema. `resource` also generates validated Elysia CRUD and a
smoke test. `scaffold` adds the SvelteKit collection and detail interfaces. `g` is an alias for
`generate`.

`auth` can also run interactively. Fully specified automation supports `--password`, `--magic-link`,
`--passkeys`, `--oauth=google,github,microsoft,apple`,
`--mfa=totp,backup-codes,email-otp,trusted-devices`, `--bearer`, `--api-key`, and
`--database=<name>`. See [Authentication](./authentication.md).

`model`, `resource`, and `scaffold` accept `--database=<name>`,
`--id-type=uuid|integer|bigint`, `--id-encoding=standard|base64url`, `--soft-delete`, and
`--no-timestamps`. Resource/scaffold additionally accept `--only=<actions>` and `--except=<actions>`;
scaffold always includes UI, while resource includes UI only with `--ui`. API-only projects omit UI.

`realtime` recipes are `notifications`, `status`, `progress`, `stream`, `dashboard`, `chat`, `presence`,
and `custom`. The optional feature name follows the recipe. Transport defaults by recipe and can be
overridden with `--transport=sse|websocket`.

`audit` generates an adapter-aware Drizzle schema plus the application-owned `audit.record()` API and
recursive metadata sanitizer. It defaults to `primary`; pass `--database=<name>` for an existing named
PostgreSQL, MySQL, or SQLite database. See [Audit logging](./audit.md).

`mailer` and `sms` generate small typed definitions. The first Messaging generator installs the
application-owned Mail/SMS setup, provider environment examples, and the two ordinary Bunway delivery
Jobs. See [Messaging](./messaging.md).

### Field types

| Type                                                       | Drizzle representation     |
| ---------------------------------------------------------- | -------------------------- |
| `string`, `text`; `varchar`; `char`                        | `text`; `varchar`; `char`  |
| `smallint`, `integer`, `bigint`                            | matching integer builder   |
| `decimal`, `numeric`                                       | `numeric`                  |
| `real`, `float`                                            | `real`, `doublePrecision`  |
| `boolean`                                                  | `boolean`, default `false` |
| `date`                                                     | `date`                     |
| `time`, `datetime`, `timestamp`, `timestamptz`, `interval` | matching temporal builder  |

Scaffolded `date`, `time`, `datetime`, `timestamp`, and `timestamptz` form controls use Bunway's generated `DateField`, which is composed from the shadcn-svelte `Input` component. Timestamp variants use a datetime-local control; `date` and `time` retain their matching input semantics.
| `uuid` | `uuid` |
| `json`, `jsonb` | matching JSON builder |
| `inet`, `cidr`, `macaddr`, `macaddr8` | matching network builder |
| `enum=a,b`, `type[]` | constrained text enum, PostgreSQL array |
| `image`, `file`, `files` | attachment definition; no resource-table column |

Use `:optional` or `:unique` where supported. Relationship types are documented separately.

### Primary-key type

Application-generated UUIDv7 is the PostgreSQL default. MySQL and SQLite use adapter-specific defaults.
Configure a SQL application default with
`BUNWAY_ID_TYPE=uuid|integer|bigint`, or
override one generated model/resource with `--id-type=...`. References and generated joins inspect the
target Drizzle schema so their columns and Elysia validation use the target key type.

UUID IDs use the standard representation by default. Opt into compact 22-character URL-safe IDs with
`--id-encoding=base64url` or `BUNWAY_ID_ENCODING=base64url`. The only supported encodings are
`standard` and `base64url`, and encoding may be configured only when the ID type is `uuid`.

### Action selection

```sh
bunway g scaffold Product name:string --only=index,show,create
bunway g scaffold Product name:string --except=destroy
```

Actions are `index`, `show`, `create`, `update`, and `destroy`. Options affect both generated API routes
and UI controls.

### Soft deletion

```sh
bunway g scaffold Product name:string --soft-delete
```

This adds an indexed nullable `deletedAt` timestamp. Generated reads exclude deleted records, delete
sets the timestamp, and `PATCH /products/:id/restore` clears it.

### Automatic timestamps

Generated tables include `createdAt` and `updatedAt` by default. PostgreSQL supplies creation defaults,
and generated update routes refresh `updatedAt`. Pass `--no-timestamps` to `model`, `resource`, or
`scaffold` when a table intentionally does not need them.

## Application console

`bunway console` (or `bunway c`) starts Bun's native interactive console in the application directory.
It preloads `app`, `db`, `schema`, and every explicitly exported Drizzle table:

```ts
await db.select().from(products).limit(5);
await db.insert(tags).values({ name: "Featured" }).returning();
app.routes;
```

The console imports the application's normal database and schema modules. It adds no model classes or
query abstraction; application code uses Drizzle directly.
