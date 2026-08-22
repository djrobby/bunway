# create-bunway

Create a new [Bunway](https://bunway.dev) application in one command.

Bunway is a lightweight, Rails-inspired framework for Bun that combines Elysia, Drizzle, PostgreSQL,
Eden Treaty, SvelteKit, Svelte 5, Tailwind CSS, and shadcn-svelte while keeping the generated code
ordinary and editable.

## Create an application

```sh
bun create bunway shop
cd shop
cp .env.example .env
bunway db:migrate
bunway dev
```

PostgreSQL is the default. Other supported starters are available explicitly:

```sh
bun create bunway shop --database=sqlite
bun create bunway shop --database=mysql
bun create bunway shop --database=pocketbase
```

Skip dependency installation when another workflow will install later:

```sh
bun create bunway shop --no-install
```

The generated project is a conventional Bun application, not a black box. Continue with the
[getting-started guide](https://bunway.dev/getting-started) or explore the
[Bunway documentation](https://bunway.dev).
