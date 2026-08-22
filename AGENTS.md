# AGENTS.md

## Project

Bunway is a lightweight, opinionated, Rails-inspired application framework for Bun.

Its purpose is to provide Rails-like developer productivity through conventions, scaffolding, generators, and a small number of useful application primitives without recreating Rails’ runtime complexity.

Core stack:

* Bun
* Elysia
* PostgreSQL
* Drizzle ORM
* Drizzle Kit
* Bun.SQL
* Eden Treaty
* SvelteKit
* Svelte 5
* Tailwind CSS
* shadcn-svelte
* Bun test

Bunway should remain a thin productivity layer over these technologies.

---

## Primary Rule

**Keep Bunway small.**

Before adding code, abstractions, packages, directories, configuration, or framework concepts, ask:

> Is this actually necessary, or does Bun, Elysia, Drizzle, Eden, PostgreSQL, SvelteKit, or the Web Platform already solve it?

If an existing component solves the problem cleanly, use it directly.

Do not wrap good APIs merely to make them appear Bunway-specific.

---

## Framework Philosophy

Follow these priorities:

1. Simplicity
2. Developer experience
3. Minimal dependencies
4. Bun-native capabilities
5. Elysia-native capabilities
6. Explicit code
7. Convention over configuration
8. Performance
9. Easy escape hatches
10. Extensibility only when justified by real requirements

Prefer boring, obvious code.

Prefer deletion over abstraction.

Prefer composition over inheritance.

Prefer explicit behavior over framework magic.

Prefer generated source code over runtime indirection.

Prefer native platform functionality over dependencies.

---

## Critical Architectural Principle

Bunway should primarily **generate and organize ordinary application code**.

A generated Bunway application should look like an ordinary:

```text
Bun
+
Elysia
+
Drizzle
+
Eden
+
SvelteKit
```

application.

Avoid requiring generated applications to inherit from or wrap Bunway-specific abstractions.

Bad:

```ts
class UsersController extends BunwayController {
}
```

Bad:

```ts
class User extends BunwayModel {
}
```

Bad:

```ts
Bunway.router.resource(...)
```

Prefer:

```ts
new Elysia()
  .get(...)
  .post(...)
```

and:

```ts
db.select()
  .from(users)
```

If Bunway disappeared tomorrow, application code should remain understandable and maintainable.

---

## Current Goal

Reach a usable **v0.1 developer preview as quickly as reasonably possible**.

The priority is getting Bunway into developers’ hands.

Do not attempt to make v0.1 complete.

Do not build speculative infrastructure.

Do not pursue arbitrary test coverage.

Do not optimize for hypothetical enterprise requirements.

Real-world developer feedback should determine later development.

---

## v0.1 Scope

Prioritize:

1. Project creation
2. Development server
3. Elysia API
4. PostgreSQL
5. Drizzle
6. Drizzle Kit migrations
7. Eden Treaty
8. SvelteKit starter
9. Svelte 5
10. Tailwind CSS
11. shadcn-svelte
12. Model generator
13. CRUD resource generator
14. PostgreSQL-backed jobs
15. Worker
16. Route listing
17. Minimal smoke tests
18. Concise documentation

Defer unless required:

* Redis
* BullMQ
* RabbitMQ
* Kafka
* Docker requirements
* Kubernetes
* custom ORM
* custom RPC
* custom validation framework
* custom authentication framework
* admin UI
* job dashboard
* frontend CRUD scaffolding
* plugin marketplace
* multiple database support
* elaborate caching
* elaborate realtime abstractions
* deployment platform
* complex configuration system

---

## Keep the Runtime Thin

Bunway runtime code should exist only where Bunway provides meaningful functionality missing from the underlying stack.

Potential Bunway runtime responsibilities include:

```text
jobs
mail
storage
cache
small configuration helpers
small realtime helpers
```

Do not assume all of these need to exist.

Jobs are the primary runtime feature for v0.1.

Most Bunway value should come from:

```text
CLI
+
generators
+
conventions
+
sensible defaults
```

rather than runtime abstractions.

---

## CLI

The CLI is a first-class part of Bunway.

Target developer experience:

```bash
bun create bunway myapp

cd myapp

bunway dev
bunway routes

bunway g model User name:string email:string:unique

bunway g resource Customer \
  name:string \
  email:string \
  active:boolean

bunway g job ProcessOrder

bunway db:migrate

bunway worker
```

Aliases such as:

```bash
bunway g
```

should be supported where they improve usability without creating complexity.

CLI errors must be understandable and actionable.

Do not expose internal stack traces for ordinary user mistakes unless debug mode is enabled.

---

## Generators

Generators are one of Bunway’s most important features.

Generated code must be:

* small
* readable
* idiomatic
* editable
* unsurprising
* directly based on the underlying libraries

Do not generate unnecessary files.

A resource generator should initially target approximately:

```text
src/db/schema/customers.ts
src/routes/customers.ts
tests/customers.test.ts
```

Do not generate:

```text
controller
service
repository
DTO
entity
interface
mapper
serializer
presenter
use-case
adapter
```

for every resource.

Applications can introduce those concepts later when genuinely needed.

---

## Project Structure

Keep the default application structure shallow.

Prefer approximately:

```text
src/
├── app.ts
│
├── db/
│   ├── index.ts
│   ├── schema/
│   └── migrations/
│
├── routes/
│
├── jobs/
│
├── mailers/
│
├── storage/
│
└── lib/

web/

tests/

package.json
bun.lock
drizzle.config.ts
tsconfig.json
.env.example
README.md
```

Do not introduce architectural directories without an immediate requirement.

Avoid default structures containing:

```text
controllers/
services/
repositories/
entities/
DTOs/
interfaces/
use-cases/
adapters/
ports/
domain/
infrastructure/
```

---

## Elysia

Use Elysia directly.

Route modules should generally be composable Elysia instances.

Example:

```ts
export const customers = new Elysia({
  prefix: '/customers'
})
  .get('/', ...)
  .get('/:id', ...)
  .post('/', ...)
  .patch('/:id', ...)
  .delete('/:id', ...)
```

Compose them normally:

```ts
const app = new Elysia()
  .use(customers)
  .use(orders)
  .use(users)
```

Do not introduce Bunway controllers.

Do not introduce Bunway routers.

Do not hide Elysia.

---

## Validation

Use Elysia’s validation facilities.

Do not introduce another validation library without a compelling technical requirement.

Validation should happen at appropriate application boundaries.

Generated APIs should be validated by default.

---

## Eden Treaty

Eden Treaty is Bunway’s preferred first-party TypeScript API interface.

Preserve the Elysia application type.

Avoid duplicating:

```text
API DTOs
request interfaces
response interfaces
generated clients
RPC schemas
```

when Eden can infer the contract.

Do not create a Bunway RPC protocol.

---

## Database

Default database:

**PostgreSQL**

Default database access:

```text
Drizzle
+
Bun.SQL
```

Drizzle provides:

* TypeScript schema
* typed queries
* relations
* migration support

Bun.SQL remains available when direct SQL is clearer or more appropriate.

Do not hide PostgreSQL behind Bunway abstractions.

Do not create:

```text
BunwayModel
BunwayRecord
BunwayRepository
```

Use Drizzle directly.

---

## SQL

SQL is not an implementation detail that Bunway needs to hide.

When a query is clearer in SQL, use SQL.

Do not force complex queries through an abstraction merely for consistency.

Prefer efficient database operations over application-side transformations.

Watch for:

* N+1 queries
* unnecessary round trips
* missing indexes
* unbounded queries
* unnecessary selected columns

Performance behavior should remain understandable from reading the code.

---

## Database Migrations

Use Drizzle Kit.

Do not create a parallel Bunway migration system.

Bunway CLI commands may provide convenient aliases around Drizzle tooling.

For example:

```bash
bunway db:migrate
```

may orchestrate the appropriate Drizzle command.

The underlying migration mechanism remains Drizzle.

---

## Jobs

Jobs are an intentional Bunway runtime abstraction.

Desired API:

```ts
export const processOrder = job(
  'process-order',
  async ({ orderId }: { orderId: string }) => {
    // work
  }
)
```

Support:

```ts
await processOrder.performNow({
  orderId
})
```

and:

```ts
await processOrder.performLater({
  orderId
})
```

Keep the API small.

Do not attempt to reproduce every ActiveJob feature.

---

## Job Queue

Use PostgreSQL by default.

Do not require Redis.

Do not require external queue infrastructure.

The queue should support the minimum required functionality:

* enqueue
* claim
* execute
* complete
* failure recording
* retries
* multiple workers
* optional queues
* delayed execution when implemented

Use PostgreSQL locking semantics such as:

```sql
FOR UPDATE SKIP LOCKED
```

where appropriate.

Correctness matters more than feature count.

---

## Worker

Provide:

```bash
bunway worker
```

Workers should use the same application codebase and database configuration.

Do not create a separate worker framework.

Avoid unnecessary process orchestration.

---

## SvelteKit

Use SvelteKit directly.

Do not wrap:

* routing
* SSR
* load functions
* forms
* actions
* stores
* navigation
* components

Use Svelte 5 conventions.

Bunway should configure SvelteKit, not replace it.

---

## Frontend UI

Default frontend:

```text
SvelteKit
Svelte 5
Tailwind CSS
shadcn-svelte
```

Use current stable versions.

Do not add a large UI framework on top of shadcn-svelte.

Do not introduce frontend state libraries by default.

Use Svelte and SvelteKit capabilities first.

---

## TanStack Query

Do not include TanStack Query by default.

Add it only when an application genuinely requires sophisticated client-side server-state behavior such as:

* aggressive background synchronization
* complex optimistic updates
* advanced query invalidation
* infinite queries
* extensive client-side caching

SvelteKit should handle normal data loading and mutations.

---

## Realtime

Use Bun and Elysia capabilities directly.

Use:

* SSE for primarily server-to-client streams
* WebSockets for bidirectional realtime communication

Do not introduce Socket.IO or another realtime framework without a concrete requirement.

Do not build a Bunway realtime protocol for v0.1.

When implementing realtime functionality, classify the use case before choosing a transport:

```text
notifications, status, progress, AI streaming, live dashboard → Bunway Realtime SSE
chat, presence, collaboration, interactive control             → Bunway Realtime WebSocket
```

Use Bunway Realtime before installing another realtime framework. Raw Bun or Elysia transports remain
the escape hatch for requirements the small channel API does not cover.

---

## Caching

Do not require Redis.

Do not add caching merely because production systems often have caches.

PostgreSQL should remain the source of truth.

If Bunway eventually exposes caching, keep the interface tiny.

Possible API:

```ts
cache.get()
cache.set()
cache.delete()
cache.remember()
```

Default to memory where appropriate.

Redis may later become an optional adapter.

---

## Mail

Do not build a large mail framework.

When mail support is implemented, provide a small provider-neutral interface.

Do not make mail support block v0.1.

---

## Storage

Do not recreate ActiveStorage.

When implemented, keep storage operations simple:

```ts
storage.put()
storage.get()
storage.delete()
storage.exists()
storage.url()
```

Local filesystem may be used during development.

S3-compatible storage should be the likely production default.

Storage should not block v0.1.

---

## Authentication

Do not build Bunway authentication from scratch for v0.1.

Authentication should remain optional.

Better Auth may be evaluated as the preferred integration.

Do not let authentication delay the initial developer preview.

---

## OpenAPI

Prefer Elysia’s official OpenAPI functionality.

Do not build custom API documentation.

The intended split is:

```text
Eden Treaty → first-party TypeScript clients

OpenAPI → external clients
```

---

## Dependencies

Dependencies are a cost.

Before adding one, determine whether its functionality already exists in:

* Bun
* Elysia
* Drizzle
* Eden
* PostgreSQL
* SvelteKit
* Svelte
* Web APIs

Do not add packages for trivial helpers.

Do not add packages because they are popular.

Every dependency should solve a real problem.

---

## Package Versions

When adding or updating npm packages, verify the latest stable version from the npm registry at implementation time.

Do not assume package versions from memory.

Use compatible latest stable releases unless the project explicitly documents a version constraint.

Do not casually downgrade dependencies to work around an implementation problem.

Investigate the actual incompatibility first.

---

## Bun First

Prefer Bun-native functionality wherever practical.

Examples include:

* runtime
* package management
* testing
* HTTP
* WebSockets
* TCP
* UDP
* file APIs
* subprocesses
* SQL
* environment handling
* hashing
* shell-independent process execution

Avoid Node-specific compatibility packages when Bun already provides the capability cleanly.

---

## Shell Commands

Do not use chained shell commands for normal development automation.

Avoid patterns such as:

```bash
command1 && command2 && command3
```

especially when an agent will repeatedly require authorization for the chain.

Execute commands individually.

For Bunway’s own process orchestration, prefer Bun subprocess APIs over shell command chains.

Commands should remain independently inspectable and debuggable.

---

## Testing

v0.1 intentionally uses minimal testing.

Do not pursue coverage percentages.

Do not create tests for trivial implementation details.

Protect the critical developer experience.

Required areas:

### Project creation

A generated application must be valid.

### Installation

Dependencies must install.

### Build

Generated application must build.

### Boot

Generated application must start.

### Model generation

Generated schema must compile.

### Resource generation

Generated resource must compile and expose expected routes.

### CRUD smoke test

One generated resource should demonstrate:

```text
create
read
update
delete
```

### Database migration

Migration must execute against PostgreSQL.

### Jobs

At minimum verify:

```text
enqueue
execute
complete
```

Add additional tests when fixing regressions or protecting important behavior discovered through real usage.

---

## Bug Fixes

When fixing a real regression, add a focused regression test when practical.

Do not build an elaborate testing harness for a tiny bug.

Fix the root cause.

Do not hide bugs behind retries, arbitrary sleeps, or swallowed exceptions.

---

## Error Handling

Errors should be useful to developers.

CLI errors should explain:

1. what failed
2. likely reason when known
3. what the developer can do next

Avoid enormous stack traces for expected user errors.

Do not silently swallow failures.

Do not create an elaborate custom exception hierarchy.

---

## Logging

Keep logging simple.

Use structured logging only where it provides clear value.

Do not introduce a logging platform dependency for v0.1.

Development logs should prioritize readability.

Production logs should work naturally with stdout/stderr and systemd/journald.

---

## Production Philosophy

Bunway should run comfortably on a basic VPS.

Baseline production architecture:

```text
Internet
   ↓
Nginx
   ↓
Bun
   ↓
Elysia
   ↓
PostgreSQL
```

Use systemd for process supervision.

Do not require:

* Docker
* Kubernetes
* PM2
* Redis
* external queue infrastructure

These may be used by applications that need them, but they are not Bunway requirements.

---

## Security

Do not sacrifice basic security for development speed.

At minimum:

* validate external input
* parameterize SQL
* do not expose secrets
* avoid unsafe filesystem paths
* use secure defaults
* avoid leaking internal errors in production
* treat uploaded files as untrusted
* keep dependencies current

Do not build speculative security abstractions.

Use the security mechanisms provided by the underlying platform.

---

## Documentation

Keep documentation concise and current.

Prefer examples over essays.

Maintain:

```text
README.md

docs/
├── architecture.md
├── decisions.md
└── roadmap.md
```

Do not create documentation files without a clear purpose.

---

## Architectural Decisions

When an architectural decision is:

* non-destructive
* likely to matter again
* likely to cause future agents to ask the same question

record it in:

```text
docs/decisions.md
```

Then proceed.

Do not repeatedly ask for approval for decisions that have already been documented.

Existing documented decisions should be treated as authoritative unless current requirements explicitly override them.

---

## Agent Autonomy

Agents should work autonomously on normal implementation details.

Do not stop for permission on routine choices.

When several reasonable implementations exist:

1. choose the simplest
2. choose the fewest dependencies
3. prefer Bun-native functionality
4. prefer Elysia-native functionality
5. prefer Drizzle/PostgreSQL directly
6. document meaningful architectural decisions
7. continue

Ask before proceeding only when the decision:

* is destructive
* fundamentally changes Bunway’s philosophy
* significantly expands scope
* introduces a major dependency
* creates meaningful backwards compatibility consequences
* requires credentials or unavailable external resources
* conflicts with documented requirements

---

## Do Not Overengineer

Do not introduce abstractions because they might be useful later.

Avoid speculative:

* interfaces
* factories
* adapters
* dependency injection
* providers
* registries
* plugin systems
* event buses
* generic repositories
* base classes
* configuration layers

Implement the concrete requirement first.

Refactor after repeated patterns actually emerge.

A little duplication is preferable to the wrong abstraction.

---

## Refactoring Rule

Use the rule of three as guidance.

Do not immediately abstract the first repeated pattern.

When similar code appears multiple times and the abstraction is obvious, consider extracting it.

The resulting abstraction must reduce cognitive load.

If the abstraction requires more explanation than the duplicated code, keep the duplication.

---

## Performance

Bunway should remain fast by avoiding unnecessary work rather than chasing synthetic benchmarks.

Prioritize:

* minimal middleware
* minimal dependencies
* efficient SQL
* few database round trips
* streaming where appropriate
* Bun-native APIs
* avoiding unnecessary serialization
* avoiding unnecessary network hops
* avoiding unnecessary runtime abstraction

Do not sacrifice maintainability for insignificant benchmark gains.

Measure before introducing performance infrastructure.

---

## Backwards Compatibility

During the early developer preview, APIs may evolve quickly.

However, do not make unnecessary breaking changes.

When changing generated conventions or public Bunway APIs:

1. understand existing behavior
2. determine whether the breaking change is justified
3. document the decision
4. update examples and documentation
5. update relevant smoke tests

Once Bunway approaches stable releases, backwards compatibility requirements should become significantly stricter.

---

## Commit Discipline

Keep changes focused.

Do not combine unrelated refactors with feature work.

Prefer small understandable commits.

Suggested prefixes:

```text
feat:
fix:
refactor:
docs:
test:
chore:
```

Do not rewrite unrelated code merely because you prefer another style.

---

## Generated Code Quality

Treat generated code as product output.

Generated code should be code a skilled developer would willingly write manually.

Never justify ugly generated code with:

> users do not need to look at it

Bunway-generated source is intentionally meant to be read and modified.

---

## Avoid Magic

Do not implement hidden:

* filesystem discovery
* implicit registration
* decorators
* runtime reflection
* dependency injection
* naming-based behavior

unless the developer experience improvement clearly outweighs the hidden behavior.

Prefer:

```ts
app.use(customers)
```

over automatically discovering every route file.

Explicit registration is cheap and understandable.

Generators may automatically update explicit registration files when appropriate.

---

## Source of Truth

Each concept should have one obvious source of truth.

Examples:

```text
Database schema → Drizzle schema

HTTP routes → Elysia route definitions

API types → Elysia + Eden inference

Migrations → Drizzle migrations

Package versions → package.json / bun.lock

Jobs → job definitions

Configuration → environment + minimal config
```

Do not duplicate information across Bunway-specific metadata files unless absolutely necessary.

---

## Development Workflow

Prefer the shortest useful feedback loop:

```text
change
↓
format/typecheck if applicable
↓
focused smoke test
↓
run
↓
continue
```

Do not run the entire test suite after every trivial edit.

Run focused tests during implementation.

Run the critical smoke suite before completing a significant feature.

---

## Required Test App And Documentation Updates

Every requested Bunway change must also be reflected in both:

```text
Z:\projects\bun-apps\bunway-test-app

the relevant README.md or docs/ documentation
```

Do not treat `local-package-smoke` as the user-facing test application. It is a package smoke fixture.
When generated behavior changes, update the generator, its focused tests, the real `bunway-test-app`
example, and the relevant documentation before declaring the work complete.

If a change genuinely has no applicable runtime or visible representation in the test app, verify that
explicitly and document the behavior or decision rather than silently skipping either requirement.

For every requested change, proactively determine whether it affects behavior across the board. Inventory
every relevant generator, adapter, schema, route, page, inverse relationship, polymorphic relationship,
self-referential relationship, test, test-app example, and documentation surface before editing. This is
required even when the user mentions only one example and does not say “across the board.” Do not implement
only the named examples. Before claiming completion, verify the complete impact inventory and report any
intentionally unsupported case.

---

## v0.1 Implementation Order

Unless existing repository state requires otherwise:

### Phase 1

Project creation and development boot.

### Phase 2

PostgreSQL + Drizzle + migrations.

### Phase 3

Model generator.

### Phase 4

Resource generator.

### Phase 5

Eden integration with SvelteKit.

### Phase 6

PostgreSQL jobs + worker.

### Phase 7

CLI polish and route listing.

### Phase 8

Documentation.

### Phase 9

Release developer preview.

Do not expand scope while completing these phases.

---

## Stop Rule

Once v0.1 requirements work:

**Stop adding features.**

Do not fill remaining time with speculative functionality.

Prepare the developer preview.

Let users try Bunway.

Use actual feedback to determine v0.2.

---

## Definition of Done for v0.1

A developer should be able to run:

```bash
bun create bunway shop

cd shop

bunway g resource Product \
  name:string \
  price:decimal

bunway db:migrate

bunway dev
```

and have a working:

```text
SvelteKit frontend
+
Eden Treaty client
+
Elysia API
+
validated CRUD
+
Drizzle schema
+
PostgreSQL
```

They should then be able to run:

```bash
bunway g job ImportProducts
bunway worker
```

and execute a PostgreSQL-backed background job.

If this experience works reliably, v0.1 is ready for developers to try.

---

## Final Decision Filter

Before implementing anything, ask:

> Does this make Bunway materially easier to use without materially making Bunway harder to understand?

If yes, implement the smallest version.

If no, do not add it.

When uncertain:

**choose less framework.**

---

## Change Handoff

After completing any code or documentation change, include a short, single-line Git commit message in
the final response.
