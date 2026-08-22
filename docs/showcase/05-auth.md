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

```dotenv
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
BETTER_AUTH_URL=http://localhost:3000
WEB_ORIGIN=http://localhost:5173
AUTH_APP_NAME=Bunway Showcase
```

OAuth callbacks are `http://localhost:3000/api/auth/callback/google` and `/github`. Without both client
values, development disables that provider with guidance; password registration still works.

:::tip Verify it
Register, sign out/in, and open `/account`. At `/account/security`, scan the TOTP QR code, verify a code,
and save the one-time backup codes. Test OAuth only after supplying real credentials.
:::

MFA currently challenges password sign-in; read [Authentication](../authentication.md) before imposing a
broader policy. Next: [add Audit and Messaging](./06-audit-messaging.md).
