---
title: 5. Add authentication and MFA
---

# 5. Add authentication and MFA

```sh
bunway g auth --password --magic-link --oauth=google,github --mfa=totp,backup-codes --database=primary
bunway db:migrate
```

This configures Better Auth, required Drizzle tables/plugins, Elysia integration, login/registration,
account security, and a protected route.

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

Restart `bunway dev` after editing `.env`. The generator already created and registered
`src/auth/index.ts`, `src/auth/plugin.ts`, `src/routes/account.ts`, `web/src/lib/auth-client.ts`, and the
four Auth pages. Do not create a second auth client or manually add Auth to `resources.ts`; the sidebar
footer changes between **Sign in** and the signed-in account.

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
broader policy. Next: [add Audit and Messaging](./06-audit-messaging.md).
