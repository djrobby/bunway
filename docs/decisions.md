# Decisions

These are current durable decisions, not an implementation diary. Unless a heading says
**Superseded**, its status is **Accepted**. Each entry states the decision, its reason, and its principal
consequences. Proposed work belongs in the Roadmap, not here.

## Bun-only tooling

All package installation, scripts, tests, package executables, and process orchestration use Bun. Generated applications do not require npm, pnpm, or yarn.

Drizzle Kit generates PostgreSQL migration files, while Drizzle ORM's Bun.SQL migrator applies them.
Stable Drizzle Kit 0.31 hides database exceptions behind its migration spinner; the Bun.SQL path keeps
failures actionable and removes the otherwise-stale `pg`/Postgres.js tooling dependency.

## Explicit generated registration

Generators update small schema, route, and job index files. This keeps registrations visible and avoids filesystem discovery or runtime reflection.

## Showcase relationship intent

The publishing showcase uses polymorphic `postTaggings` deliberately. Ordinary `many_to_many` remains
a separate documented generator pattern and must not be substituted into the Blog query merely to
make an app created from an obsolete tutorial appear compatible. Preview showcase apps are disposable;
the guide tells affected users to regenerate the demo so its schema matches the lesson.

## Jobs are the only v0.1 runtime abstraction

The CLI generates ordinary application code. `@bunway/core` exists only for the PostgreSQL queue, where Bun, Elysia, and Drizzle do not provide a job API.

## Realtime is process-local and transport-specific

Bunway Realtime defines typed channels over one transient in-memory subscriber map. SSE serves
server-to-client updates and WebSockets serve bidirectional communication through Elysia. The API does
not expose broker drivers until a PostgreSQL `LISTEN/NOTIFY` bridge exists. Job handlers receive an
optional progress context; cross-process worker progress is deferred to that bridge.

## TypeScript compatibility pin

The August 2026 registry marks TypeScript 7 as latest, and Bun 1.4 supports its explicit type discovery requirements. Bunway's backend checks therefore run the latest TypeScript 7 compiler with `types: ["bun"]`. During Svelte's TypeScript 7 transition, generated web workspaces follow `svelte-check`'s required dual installation: TypeScript 6 for its compatibility API plus TypeScript 7 as `@typescript/native`, with checks run through `svelte-check --tsgo`.

## Drizzle Kit owns SQL migrations

The CLI runs Drizzle Kit's `generate` command with the selected database config, then applies those
migration files through Drizzle ORM using Bun.SQL, mysql2, or `bun:sqlite`. This keeps one visible SQL
migration format while preserving actionable database errors.

## Named databases keep native clients and migrations

`src/db/config.ts` is the small source of connection names and adapters. `primary` retains the shallow
`src/db/schema` layout and the `db` export; additional SQL databases receive explicit subdirectories,
static client exports, and one Drizzle Kit config each. The CLI invokes Drizzle Kit separately rather
than creating a migration format or implying cross-database transactions. PostgreSQL uses Drizzle over
Bun.SQL, SQLite uses Drizzle over `bun:sqlite`, and MySQL uses Drizzle's currently documented `mysql2`
driver. Engine-specific Drizzle features remain available.

## Relationship scaffold controls

Singular relationship fields use a compact searchable combobox; collection relationships use its multi-select counterpart. Both provide an “Add new” modal and immediately select created rows. `references` and `belongs_to` generate indexed foreign keys, while `has_one` also generates a unique constraint. `has_many` and `many_to_many` generate explicit junction schemas and Elysia association routes; `has_many` makes the related key unique so a related row can belong to only one owner. There is no Bunway relationship runtime.

Generated scaffold index and detail pages link singular relationship values to related detail routes.
Collection relations, including explicit polymorphic collections, are included in index/show responses as
related-ID arrays loaded with one junction-table query per collection. Index pages show a linked count and
detail pages link each related ID. This remains generated Elysia, Drizzle, and Svelte code.
Relationship labels are treated as textual table content and are left-aligned. Collection counts are rendered
as rounded linked badges. Applications may add explicit inverse collection queries, as demonstrated by the
test app, without adding Bunway relationship metadata or runtime discovery.

## shadcn-svelte owns scaffold primitives

Generated scaffold UI uses source-installed shadcn-svelte components. Bunway composes those components but does not maintain a parallel button, dialog, table, popover, command, or tooltip design system.

## Scaffold actions, not HTTP verbs

`--only=` and `--except=` use `index`, `show`, `create`, `update`, and `destroy`. The same action set controls API and UI generation. HTTP verbs are not suitable configuration because `GET` maps to both collection and details behavior.

## Scaffold tables and themes

Collection routes return `{ records, total }` and accept pagination, text filtering, and whitelisted sort parameters; `perPage=all` explicitly opts out of pagination. Scaffold tables default to 50 rows, expose 50/100/250/all choices, and hide page navigation when unnecessary. Selection and column visibility stay as ordinary local Svelte state. A `position:integer` field enables native HTML drag-and-drop and persists reordered positions through the generated update route. This intentionally avoids adding TanStack Table or a drag-and-drop runtime dependency for the v0.1 scaffold.

## Generated application shell

New applications use the source-installed shadcn sidebar with icon-collapse behavior and a full-width content inset. Scaffold generation appends an explicit navigation entry to `web/src/lib/resources.ts`; the layout imports that ordinary TypeScript list rather than discovering routes at runtime. Light/dark/system color mode is independent from the persistent appearance settings. A right-side settings sheet exposes the current Nova, Vega, Maia, Lyra, Mira, Luma, Sera, and Rhea profiles plus theme and chart colors. These runtime profiles adjust shared tokens and selected geometry without overwriting the application's open-code shadcn component source.

The scaffold base color is fixed to Neutral; only style, theme color, and chart color remain customizable.
Date/time display preferences are browser-local UI state (timezone, date format, and 12/24-hour time), kept
separate from style settings with explicit Save and Reset actions. Generated detail Edit buttons open a
local edit dialog and update the displayed record without navigating away. Generated index create/edit
forms are modal, and destructive row actions require an explicit confirmation dialog.
Generated temporal form controls are standardized on the small `DateField` component composed from shadcn-svelte `Input`; this covers date, time, datetime, timestamp, and timestamptz without adding another date library.

## Generated names and navigation icons

The CLI owns one small naming adapter for pluralization and human-readable labels so database names, headings, filters, details links, and navigation do not independently guess plurals such as `Categories`. The same adapter selects a semantic icon key from common resource-name families and writes that key into the explicit `web/src/lib/resources.ts` entry. Generated apps map those keys to Remix icons locally and fall back to a database icon. This is deterministic generated metadata, not runtime route discovery or a model abstraction.

## Generated source formatting

Generated source is product output and must be immediately readable and editable. Before writing a new TypeScript, JavaScript, Svelte, HTML, or CSS file, the CLI formats it with Prettier and the official Svelte plugin using two-space indentation, single quotes, no semicolons, and a 100-character print width. Prettier is a CLI implementation dependency only; generated applications do not receive a formatter runtime dependency. Svelte markup is normalized at generator boundaries before formatting so adjacent generated elements and block directives become normally indented markup rather than mechanically concatenated lines. Regression tests enforce formatted scaffold output and the print-width contract.

## Explicit attachment hydration

Attachment fields do not add columns to application tables and do not change Drizzle's query API.
Framework-owned `storage_blobs` and polymorphic `storage_attachments` schemas are ordinary Drizzle
schemas. Generators write an explicit hydrator under `src/models/`; application code opts in with
`hydrateProduct(row).image`. Keeping hydrators outside schema modules lets Drizzle Kit load schemas
without importing the live Bun.SQL database. Storage adapters manage object bytes only.

## Opt-in soft deletion stays in generated Drizzle code

`--soft-delete` adds an indexed nullable `deletedAt` timestamp to the generated resource schema.
Generated queries explicitly exclude deleted rows, delete updates that timestamp, and a restore route
clears it. This is application-owned Drizzle code rather than a model base class, query wrapper, or
parallel persistence abstraction.

## Polymorphic joins are explicit

Polymorphic many-to-many fields require both an interface and join-table name, for example
`tags:many_to_many:as=taggable:through=taggings`. The generated Drizzle table constrains the related
record but intentionally cannot foreign-key the polymorphic owner ID. Generated association queries and
owner cleanup always scope by both owner type and ID. Explicit modifiers avoid inferring consequential
schema names from Rails-specific vocabulary.

## Generated timestamps are the default

Model and resource tables receive `createdAt` and `updatedAt` with database creation defaults. Generated
update routes explicitly refresh `updatedAt`. `--no-timestamps` opts out without introducing model hooks.

## Documentation changes with behavior

Docusaurus documentation is part of Bunway's public interface. Generator, CLI, configuration, and
runtime changes update the relevant guide and preserve a successful documentation build.
The npm package release does not rebuild the independent static site: the GitHub Pages workflow builds
and deploys documentation on pushes to `master`. This keeps npm publication bounded to package
verification while retaining one authoritative Pages build path. Webpack's filesystem cache is disabled
for Docusaurus because its V8 serialization is incompatible with Bun; documentation commands still run
under Bun.

## PostgreSQL runtime and migrations use Bun.SQL

Generated PostgreSQL applications use Bun.SQL through Drizzle both at runtime and when applying
migrations. Drizzle Kit remains the SQL generator, but Bunway does not invoke its stable migration
spinner because that path hides database exceptions. PostgreSQL applications therefore require no
`pg` or Postgres.js tooling dependency.

## UUID primary keys with Drizzle as relationship source of truth

Generated PostgreSQL tables store UUIDv7 values in PostgreSQL's ordinary `uuid` type. Drizzle's
`$defaultFn` calls Bun's dependency-free `Bun.randomUUIDv7()` before inserts, avoiding a PostgreSQL 18
floor, extensions, or a Bunway compatibility function. This default applies to inserts made through
Drizzle; direct SQL callers must provide an ID or explicitly choose their own database default.
MySQL stores the same UUIDv7 in `varchar(36)` and SQLite stores it as text.
`BUNWAY_ID_TYPE` provides the
application generator default and `--id-type` provides a per-resource override. When generating a
relationship, Bunway reads the referenced Drizzle schema to choose UUID, integer, or bigint; it does not
create a model registry or duplicate schema metadata. Polymorphic join users must keep owner ID types
compatible because one SQL owner-ID column serves every owner type.

# Authentication is generated Better Auth application code

`bunway g auth` generates Better Auth configuration, Drizzle schema, Elysia integration, and selected Svelte UI into the application. Bunway does not expose an authentication runtime abstraction. The selected Bunway Drizzle database owns the auth schema and `bunway db:migrate` remains the only migration workflow. Browser sessions use Better Auth's HttpOnly cookie rather than JWT/local storage. Email-dependent auth uses an explicit development-only console transport and fails clearly in production until real delivery is configured. Authorization is outside this capability.

## Audit is durable application-owned Drizzle data

Bunway Audit records meaningful historical facts directly to an application-owned Drizzle table. It
is not application/access logging, analytics, an event bus, Jobs, or Realtime. It has no query
abstraction: applications query `audit_logs` with Drizzle. Generation supports Bunway named
PostgreSQL, MySQL, and SQLite databases; recording is direct and may explicitly share a same-database
Drizzle transaction. Metadata is recursively sanitized, failures throw, and records are append-only by
convention. Bunway does not automatically queue, publish, update, delete, retain, or archive records.

## Messaging composes Mail and SMS with existing capabilities

Bunway exposes separate transactional `mail` and `sms` APIs. `send()` delivers immediately and `sendLater()` uses ordinary Bunway Jobs; no messaging queue or retry engine exists. Audit records logged, sent, and final-failed outcomes without message bodies or authentication content. Realtime is not a dependency. Development defaults to accurate console delivery, while production refuses console fallback. Resend and Twilio use native `fetch()`; Nodemailer is the only provider dependency because Bun has no SMTP client. Generated mailers and SMS definitions are optional TypeScript organization, not a template or notification framework.
