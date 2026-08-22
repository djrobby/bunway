# Bunway

Bunway is a lightweight, Rails-inspired full-stack framework for Bun. It provides conventions,
generators, database-aware scaffolding, Jobs, Realtime, Auth, Audit, Messaging, and Storage while leaving
you with ordinary Elysia, Drizzle, Eden Treaty, SvelteKit 2, Svelte 5, Tailwind, and shadcn-svelte code.

```sh
bun add --global @bunway/cli
bun create bunway shop
cd shop
cp .env.example .env
bunway g scaffold Product name:string price:decimal active:boolean
bunway db:migrate
bunway dev
```

Open the generated Product UI, then edit `src/routes/products.ts`, `src/db/schema/products.ts`, and the
SvelteKit pages directly. Bunway has no ORM, controller hierarchy, repository layer, dependency injection
container, proprietary frontend, or custom RPC protocol.

## What it provides

- PostgreSQL by default; PostgreSQL, MySQL, and SQLite connections
- model, validated API resource, full SvelteKit scaffold, Job, Realtime, Auth, Audit, Mailer, and SMS generators
- relationships, polymorphic joins, local/S3-compatible attachments, soft deletion, and UUIDv7 IDs
- PostgreSQL Jobs, typed SSE/WebSocket channels, generated Better Auth, durable Audit, and queued Mail/SMS
- Bun tests and conventional Nginx/systemd deployment without requiring Redis or containers

The [documentation](https://djrobby.github.io/bunway/) is organized for learning, building, and exact reference. Start
with [Getting started](./docs/getting-started.md), build the [Showcase](./docs/showcase/index.md), or use
the [CLI reference](./docs/cli.md) and [Architecture](./docs/architecture.md).

Each published package also includes a focused npm README for `@bunway/core`, `@bunway/cli`, and
`create-bunway` so developers can understand its role without first navigating the monorepo.

Documentation deploys to [GitHub Pages](https://djrobby.github.io/bunway/) from the `master` branch
through `.github/workflows/pages.yml`. The repository's Pages source must be set to **GitHub Actions**;
the generated `build/` directory is uploaded as an artifact and is not committed.

## Repository development

Bunway is developed and verified with Bun 1.4 and TypeScript 7. Generated SvelteKit workspaces use
the TypeScript 7 native checker through `svelte-check --tsgo`.

```sh
bun install
bun test
bun run typecheck
bun run docs:build
```

The real integration application is `Z:\projects\bun-apps\bunway-test-app`; `local-package-smoke` is
only the package smoke fixture and is excluded from root test discovery. Its PostgreSQL-backed tests run
separately when the fixture has a `DATABASE_URL`. See [AGENTS.md](./AGENTS.md) for architecture, scope,
testing, and documentation expectations.

## Release

Maintainers use `bun run release <version>`; add `--yes` only in trusted non-interactive CI. The release
script checks types, tests, documentation, and package dry runs before publishing the three packages in
dependency order. Release checks do not require a database; database integration coverage belongs to the
real `bunway-test-app` workflow. Package preflight uses `bun pm pack --dry-run`, so a package can be
validated before its new workspace dependency version exists on npm.

Before changing package versions, the release script verifies npm authentication with `bun pm whoami`.
Interactive releases offer npm's browser login when credentials are missing or expired. Non-interactive
releases require `NPM_CONFIG_TOKEN`. The authenticated account must have permission to the `bunway` npm
scope before it can publish `@bunway/core` and `@bunway/cli`.

License information will be added when the project selects and commits a license file.
