# Bunway - Initial Framework Build Prompt

You are building **Bunway**, a lightweight, opinionated, Rails-inspired application framework for Bun.

The goal is NOT to recreate Rails, Laravel, NestJS, AdonisJS, or another large abstraction-heavy framework.

The goal is:

> **Rails-like developer productivity with Bun-native performance and an extremely small, understandable codebase.**

Bunway should primarily provide **conventions, scaffolding, CLI ergonomics, and a few missing application primitives** while relying directly on excellent existing technologies.

The framework should generate ordinary Elysia, Drizzle, Eden, and SvelteKit code whenever possible.

A developer should be able to stop using Bunway later without rewriting their application.

---

# 1. Primary Goal

Get Bunway to a usable **v0.1 developer preview as quickly as possible**.

Do NOT overengineer.

Do NOT build features merely because Rails has them.

Do NOT prematurely generalize APIs.

Do NOT create abstraction layers around libraries that already have good APIs.

Do NOT spend significant time building exhaustive tests for v0.1.

Testing should initially concentrate on:

1. CLI smoke tests
2. Project generation
3. Generated application starts successfully
4. Generated resource works
5. Database migration works
6. Basic job execution works

We want real developers using Bunway as soon as possible so their feedback determines what gets built next.

Prefer shipping a small working feature over designing an elaborate future-proof architecture.

---

# 2. Core Philosophy

Every architectural decision must follow these principles, in order:

1. Simplicity
2. Developer experience
3. Minimal dependencies
4. Bun-native capabilities
5. Elysia-native capabilities
6. Explicit code over framework magic
7. Convention over configuration
8. Performance
9. Easy escape hatches
10. Extensibility only when actual requirements justify it

Bunway should be thin.

If Bun already provides something, use Bun.

If Elysia already provides something, use Elysia.

If Drizzle already provides something, use Drizzle.

If SvelteKit already provides something, use SvelteKit.

Do not wrap APIs merely so they appear to belong to Bunway.

---

# 3. Core Technology Stack

Use the latest stable releases available at implementation time.

Before adding dependencies, verify their current versions and current APIs from their official documentation.

Core stack:

* Bun
* Elysia
* PostgreSQL
* Drizzle ORM
* Drizzle Kit
* Bun.SQL where appropriate
* Eden Treaty
* SvelteKit
* Svelte 5
* Tailwind CSS
* shadcn-svelte
* Bun test

Avoid Node-specific libraries where Bun provides the capability natively.

Avoid compatibility dependencies unless necessary.

---

# 4. What Bunway Actually Is

Bunway consists primarily of two pieces:

```text
@bunway/core
@bunway/cli
```

Keep this separation unless implementation proves an even simpler structure is appropriate.

## @bunway/core

Contains only Bunway-specific runtime functionality that is genuinely missing from the underlying stack.

Initial candidates:

```text
jobs
mail
storage
cache
config
realtime helpers
```

Do NOT automatically implement all of these for v0.1.

## @bunway/cli

Provides the Rails-like developer experience:

```bash
bunway new
bunway dev
bunway generate
bunway g
bunway routes
bunway console
bunway db:migrate
bunway worker
```

The CLI is one of Bunway's most important features.

Put developer convenience primarily in **code generation and tooling**, rather than runtime magic.

---

# 5. Initial Application Experience

The target experience is:

```bash
bun create bunway myapp

cd myapp

bun install

bunway db:migrate
bunway dev
```

The application should start with as little configuration as practical.

The generated project should be immediately understandable to someone who knows TypeScript.

---

# 6. Initial Project Structure

Start approximately with:

```text
myapp/
├── src/
│   ├── app.ts
│   │
│   ├── db/
│   │   ├── index.ts
│   │   ├── schema/
│   │   └── migrations/
│   │
│   ├── routes/
│   │
│   ├── jobs/
│   │
│   ├── mailers/
│   │
│   ├── storage/
│   │
│   └── lib/
│
├── web/
│
├── tests/
│
├── package.json
├── bun.lock
├── drizzle.config.ts
├── tsconfig.json
├── .env.example
└── README.md
```

This is guidance, not an immutable architecture.

If something can be removed while retaining clarity, remove it.

Do NOT introduce directories such as:

```text
controllers
repositories
services
entities
DTOs
use-cases
adapters
ports
infrastructure
domain
interfaces
```

by default.

Applications may introduce such patterns themselves if they eventually need them.

---

# 7. Elysia Architecture

Use Elysia directly.

Routes should normally be ordinary composable Elysia modules.

Example concept:

```ts
export const users = new Elysia({
  prefix: '/users'
})
  .get('/', ...)
  .get('/:id', ...)
  .post('/', ...)
  .patch('/:id', ...)
  .delete('/:id', ...)
```

The application should compose them:

```ts
const app = new Elysia()
  .use(users)
  .use(organizations)
  .use(orders)
```

Avoid Bunway-specific routing abstractions.

Do not recreate controllers merely because Rails has controllers.

---

# 8. Eden Treaty

Use Eden Treaty as Bunway's first-party TypeScript API interface.

Preserve the Elysia application type so the frontend can obtain end-to-end API typing.

Do not build another RPC protocol.

Do not generate duplicate API interfaces when Eden can infer them.

---

# 9. Database

Use:

```text
PostgreSQL
    ↑
Bun.SQL
    ↑
Drizzle
    ↑
Elysia
```

Drizzle provides:

* TypeScript schema
* typed queries
* relations
* migrations
* migration tooling

Developers must always retain the ability to use Bun.SQL or raw SQL when appropriate.

Do not attempt to hide PostgreSQL.

Bunway should encourage developers to understand and use their database.

---

# 10. Resource Generator

This is a **v0.1 priority feature**.

Target:

```bash
bunway g resource Customer \
  name:string \
  email:string \
  active:boolean
```

Generate only the minimum useful files.

Prefer approximately:

```text
src/db/schema/customers.ts
src/routes/customers.ts
tests/customers.test.ts
```

Do NOT generate 10-15 files for one resource.

Generated routes should initially provide conventional CRUD:

```text
GET    /customers
GET    /customers/:id
POST   /customers
PATCH  /customers/:id
DELETE /customers/:id
```

Use Elysia validation.

Use Drizzle directly.

The generated code should be clean enough that a developer would willingly maintain it manually.

---

# 11. Model Generator

Support:

```bash
bunway g model User \
  name:string \
  email:string:unique
```

Generate the appropriate Drizzle schema.

Do not create a Bunway Model base class.

Do not recreate ActiveRecord.

Drizzle is the model/data-access layer.

---

# 12. Jobs - v0.1 Runtime Feature

Jobs are one Bunway abstraction worth implementing.

Target ergonomics:

```ts
export const sendWelcomeEmail = job(
  'send-welcome-email',
  async ({ userId }: { userId: string }) => {
    // work
  }
)
```

Support:

```ts
await sendWelcomeEmail.performNow({
  userId
})
```

and:

```ts
await sendWelcomeEmail.performLater({
  userId
})
```

Eventually support:

```ts
await sendWelcomeEmail.performLater(
  { userId },
  {
    wait: '5 minutes'
  }
)
```

But delayed jobs may be deferred if they materially slow down v0.1.

---

# 13. PostgreSQL Job Queue

Do NOT require:

* Redis
* BullMQ
* RabbitMQ
* Kafka
* another queue service

Use PostgreSQL.

Create a minimal jobs table approximately containing:

```text
id
queue
name
payload
priority
run_at
attempts
max_attempts
locked_at
locked_by
last_error
created_at
finished_at
```

Workers should safely claim jobs using PostgreSQL locking such as:

```sql
FOR UPDATE SKIP LOCKED
```

Support:

```bash
bunway worker
```

Initially support:

* enqueue
* perform
* retries
* failures
* multiple workers

Keep the implementation extremely small.

Correctness matters more than feature count.

---

# 14. Job Generator

Support:

```bash
bunway g job ProcessOrder
```

Generate:

```text
src/jobs/process-order.ts
```

with a minimal working template.

---

# 15. Mailers

Mailers are useful but are SECONDARY to the v0.1 resource generator and jobs.

Desired eventual API:

```ts
export const UserMailer = {
  async welcome(user) {
    return mail.send({
      to: user.email,
      subject: 'Welcome',
      template: 'welcome',
      data: { user }
    })
  }
}
```

Do not build an email templating framework.

Allow providers to be plugged in later.

For v0.1, mail may be deferred if necessary.

---

# 16. Storage

Desired eventual API:

```ts
await storage.put(key, file)
await storage.get(key)
await storage.delete(key)
await storage.exists(key)
await storage.url(key)
```

Preferred drivers:

```text
development → local filesystem
production  → S3-compatible storage
```

Do not recreate ActiveStorage.

No blob database architecture unless requirements eventually justify one.

Storage may be post-v0.1.

---

# 17. Cache

Do NOT require Redis.

If caching is implemented, start with an extremely small interface:

```ts
cache.get()
cache.set()
cache.delete()
cache.remember()
```

Default:

```text
memory
```

Redis can eventually become an optional driver.

Cache is NOT a v0.1 priority unless implementation becomes trivial.

---

# 18. Realtime

Use Elysia/Bun directly.

WebSockets should use Elysia's native capabilities.

SSE should use standard streaming responses.

Do NOT create another realtime protocol.

A tiny publish/subscribe convenience layer may eventually be useful:

```ts
realtime.publish(topic, payload)
```

but only build it when needed.

---

# 19. SvelteKit Frontend

Use SvelteKit normally.

Do not wrap SvelteKit.

Do not create Bunway-specific:

```text
pages
components
stores
forms
navigation
SSR
```

abstractions.

SvelteKit already solves these problems.

The default frontend should use:

* SvelteKit
* Svelte 5
* Tailwind CSS
* shadcn-svelte
* Eden Treaty

Avoid TanStack Query by default.

Use SvelteKit's existing data-loading and mutation capabilities unless an application specifically needs a dedicated client-side server-state library.

---

# 20. Frontend Generator

For v0.1, do NOT attempt to generate beautiful CRUD interfaces.

The first resource generator should prioritize:

```text
database
API
validation
tests
```

over frontend CRUD.

Once the backend generator is reliable, evaluate:

```bash
bunway g scaffold Customer ...
```

which could optionally generate basic shadcn-svelte CRUD pages.

Do not let this delay v0.1.

---

# 21. OpenAPI

Include Elysia's official OpenAPI support if doing so remains lightweight.

The intended model is:

```text
Eden Treaty
    ↓
first-party TypeScript clients

OpenAPI
    ↓
external clients
```

Do not build custom documentation infrastructure.

---

# 22. Authentication

Do NOT build a custom authentication framework for v0.1.

Design Bunway so authentication can be added cleanly.

Evaluate Better Auth as the preferred default integration, but do not let authentication become a prerequisite for the initial framework release.

A generated application should work without auth.

Authentication can become an optional installation or starter choice.

---

# 23. Configuration

Prefer ordinary environment variables.

Provide:

```text
.env.example
```

with things such as:

```text
DATABASE_URL=
PORT=
NODE_ENV=
```

Do not build an elaborate configuration framework.

A tiny typed environment helper is acceptable.

---

# 24. CLI Commands for v0.1

Prioritize:

```bash
bunway new
bunway dev

bunway g resource
bunway g model
bunway g job

bunway db:migrate

bunway worker

bunway routes
```

Nice-to-have:

```bash
bunway console
bunway db:rollback
bunway db:reset
bunway doctor
```

Do not delay the initial release for nice-to-have commands.

---

# 25. `bunway routes`

This should inspect or register the application's Elysia routes and display something approximately like:

```text
GET     /users
GET     /users/:id
POST    /users
PATCH   /users/:id
DELETE  /users/:id
```

Keep the implementation simple.

---

# 26. Development Command

Target:

```bash
bunway dev
```

It should start the necessary development processes with the smallest amount of orchestration possible.

Avoid introducing a process-management dependency if Bun itself can handle the workflow.

Do not use chained shell commands as the primary orchestration mechanism.

Use Bun APIs or explicit child processes where multiple processes are necessary.

---

# 27. Production

Bunway should not invent a deployment platform.

A production application should be capable of running simply as:

```text
Nginx
   ↓
Bun
   ↓
Elysia
   ↓
PostgreSQL
```

with systemd managing Bun.

Document this as the baseline deployment.

Docker should be optional.

Do not require Docker.

---

# 28. Testing Philosophy for v0.1

We deliberately want **minimal testing initially**.

Do not attempt exhaustive unit coverage.

Tests should protect the critical developer experience.

Required smoke tests:

### Project generation

```bash
bun create bunway testapp
```

must produce a valid application.

### Install

```bash
bun install
```

must succeed.

### Build

Generated application must build.

### Boot

Generated application must boot.

### Resource generation

```bash
bunway g resource Customer name:string
```

must generate valid files.

### Database

Migration generation/application must work against PostgreSQL.

### CRUD

One generated resource should successfully:

```text
create
read
update
delete
```

### Jobs

One job should:

```text
enqueue
execute
complete
```

That's sufficient for the initial developer preview.

Do not pursue arbitrary coverage percentages.

---

# 29. Documentation

Documentation is important even for v0.1.

Keep README concise.

A developer should understand Bunway within approximately five minutes.

README should include:

```text
What is Bunway?
Requirements
Create an app
Run an app
Database setup
Generate a resource
Generate a model
Generate a job
Run workers
Project structure
Deployment
Philosophy
```

Prefer working examples over long explanations.

---

# 30. Framework Rule

This rule is non-negotiable:

> **Bunway should generate and organize ordinary code rather than owning application code.**

Generated application code should directly import Elysia, Drizzle, Eden, SvelteKit, etc.

Avoid patterns like:

```ts
import {
  BunwayController,
  BunwayModel,
  BunwayRouter,
  BunwayRepository
} from '@bunway/core'
```

Prefer:

```ts
import { Elysia, t } from 'elysia'
import { db } from '../db'
```

Bunway should disappear into the background after generating the application.

---

# 31. Dependency Rule

Every new dependency must answer:

> What meaningful capability does this provide that Bun, Elysia, Drizzle, SvelteKit, PostgreSQL, or a few lines of our own code do not already provide?

If the answer is weak, do not install it.

Do not add dependencies for trivial utilities.

Prefer Web APIs and Bun-native APIs.

---

# 32. Performance Rule

Do not create abstractions that make performance behavior difficult to understand.

Database access should remain visible.

HTTP behavior should remain visible.

Queries should remain visible.

Caching should remain explicit.

Background execution should remain visible.

Avoid hidden N+1 queries and implicit network calls.

---

# 33. Error Handling

Provide a simple consistent error strategy.

Do not create an elaborate hierarchy of exception classes.

Elysia's existing error capabilities should do most of the work.

Provide Bunway-specific errors only when Bunway itself needs them.

---

# 34. Initial Release Scope

The first usable release should focus on only this:

```text
1. Create project
2. Run project
3. PostgreSQL + Drizzle
4. Elysia API
5. Eden Treaty
6. SvelteKit starter
7. shadcn-svelte/Tailwind starter
8. Generate model
9. Generate CRUD resource
10. Run migrations
11. PostgreSQL-backed jobs
12. Run worker
13. Basic route listing
14. Minimal tests
15. Basic documentation
```

Everything else can wait.

Specifically defer unless trivial:

```text
mail
storage
Redis
advanced cache
advanced realtime
admin UI
job dashboard
authentication framework
authorization framework
deployment platform
Docker tooling
plugin marketplace
complex configuration
frontend CRUD scaffolding
multiple database support
ORM abstraction
custom validation
custom RPC
```

---

# 35. Implementation Order

Build in this exact general order unless implementation reveals a compelling reason to change it.

## Phase 1 - Boot

Get this working:

```bash
bun create bunway myapp
cd myapp
bun install
bunway dev
```

The browser/API must respond.

Commit.

## Phase 2 - Database

Implement:

```text
PostgreSQL
Drizzle
Drizzle Kit
Bun.SQL
```

Make one manually defined resource work.

Commit.

## Phase 3 - Model Generator

Implement:

```bash
bunway g model
```

Confirm generated schema compiles.

Commit.

## Phase 4 - Resource Generator

Implement:

```bash
bunway g resource
```

Generate schema + Elysia CRUD routes + smoke test.

Commit.

## Phase 5 - Eden

Ensure generated API typing works from the SvelteKit frontend.

Commit.

## Phase 6 - Jobs

Implement:

```text
job()
performNow()
performLater()
Postgres queue
worker
```

Commit.

## Phase 7 - CLI Polish

Implement:

```bash
bunway routes
bunway db:migrate
```

Improve errors and help output.

Commit.

## Phase 8 - Documentation

Create the v0.1 README and quick-start.

Commit.

## Phase 9 - Developer Preview

Stop building.

Release.

Get users.

Collect problems.

Only then decide what v0.2 contains.

---

# 36. Working Style

Work autonomously.

Do not repeatedly stop for minor implementation choices.

When multiple reasonable options exist:

1. choose the simplest
2. choose the option with fewer dependencies
3. choose the option closest to Bun/Elysia/Drizzle native behavior
4. document the decision
5. continue

Ask for input only when:

* the choice fundamentally changes Bunway's public philosophy
* it introduces a major dependency
* it creates backwards compatibility implications
* credentials or external resources are required
* an operation is destructive
* requirements genuinely conflict

Do not ask permission for ordinary implementation decisions.

Do not use chained shell commands as a shortcut for workflow orchestration.

Keep commands individually inspectable and debuggable.

---

# 37. Decision Documentation

Maintain lightweight project documentation containing important architectural decisions.

When a non-destructive architectural decision is made and likely to matter again, document it immediately so future agents do not repeatedly ask the same question.

Do not create excessive documentation.

Prefer a small:

```text
docs/
├── architecture.md
├── decisions.md
└── roadmap.md
```

over a sprawling documentation tree.

---

# 38. Definition of v0.1 Success

Bunway v0.1 succeeds if a new developer can do this:

```bash
bun create bunway shop

cd shop

bunway g resource Product \
  name:string \
  price:decimal

bunway db:migrate

bunway dev
```

and quickly have:

```text
SvelteKit frontend
+
typed Eden client
+
Elysia API
+
validated CRUD endpoints
+
Drizzle schema
+
PostgreSQL
```

Then:

```bash
bunway g job ImportProducts

bunway worker
```

provides working background jobs.

The generated project should still feel like:

> **a small Bun/Elysia application**

rather than:

> **an application trapped inside a framework.**

---

# 39. Final Principle

When uncertain whether Bunway needs another feature or abstraction, default to:

**No.**

Ship the smaller implementation.

Bunway exists to make Bun applications easier to start and organize - not to hide Bun.

Begin by inspecting the current repository, determining what already exists, and implementing **Phase 1 only**.

Once Phase 1 is demonstrably working, continue sequentially through the phases without expanding scope.

The objective is a **small, functional v0.1 developer preview in the shortest reasonable time**, not a theoretically complete framework.
