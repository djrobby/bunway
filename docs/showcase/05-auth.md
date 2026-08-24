---
title: 6. Add authentication and MFA
---

# 6. Add authentication and MFA

```sh
bunway g auth --password --magic-link --oauth=google,github --mfa=totp,backup-codes --database=primary
bunway db:migrate
```

This configures Better Auth, required Drizzle tables/plugins, Elysia integration, login/registration,
account security, and a protected route. In an installed app the generator runs `bun install`
automatically; if dependencies have not been installed yet, it prints the required `bun install`
instruction instead.

Generate a local secret with Bun and paste the printed value into `.env`:

```sh
bun -e "console.log(crypto.getRandomValues(new Uint8Array(32)).toBase64())"
```

```dotenv
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
BETTER_AUTH_URL=http://localhost:3000
WEB_ORIGIN=http://localhost:5173
AUTH_APP_NAME=Bunway Showcase
```

OAuth callbacks are `http://localhost:3000/api/auth/callback/google` and `/github`. Without both client
values, development disables that provider with guidance; password registration still works.
Those API URLs verify the provider response. The generated browser page sends its absolute UI origin as
the final callback, so OAuth and magic-link sign-in return to `http://localhost:5173/` in development.
An API-only client may omit `callbackURL` or supply a different absolute destination.

Restart `bunway dev` after editing `.env`. The generator already created and registered
`src/auth/index.ts`, `src/auth/plugin.ts`, `src/routes/account.ts`, `web/src/lib/auth-client.ts`, and the
four Auth pages. Do not create a second auth client or manually add Auth to `resources.ts`; the global
sidebar uses a dependency-free **Account** link so an Auth-only error cannot prevent unrelated resource
pages from rendering.

Seed an account through Better Auth's ordinary HTTP endpoint. On macOS/Linux:

```sh
curl --silent --fail-with-body --request POST http://localhost:3000/api/auth/sign-up/email --header 'content-type: application/json' --data-raw '{"name":"Ada Lovelace","email":"ada@example.test","password":"correct-horse-battery-staple"}'
```

On Windows PowerShell:

```powershell
curl.exe --silent --fail-with-body --request POST http://localhost:3000/api/auth/sign-up/email --header "content-type: application/json" --data-raw '{"name":"Ada Lovelace","email":"ada@example.test","password":"correct-horse-battery-staple"}'
```

:::tip Verify it

1. Open `http://localhost:5173/register`, enter a name, email, and password, and submit.
2. Sign out from `/account`, then sign in again at `/login`.
3. Open `/account/security`, enable TOTP, scan the QR code, and enter the current six-digit code.
4. Store the displayed backup codes outside the application and test one only if you can safely rotate
   the set afterward.
5. Test OAuth only after supplying a real provider client ID/secret and adding the callback URL in that
   provider's console.
   :::

MFA currently challenges password sign-in; read [Authentication](../authentication.md) before imposing a
broader policy. Next: [build the Audit showcase](./06-audit.md).
