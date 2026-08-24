# Authentication

Bunway scaffolds application-owned [Better Auth](https://better-auth.com) code. Better Auth remains the authentication engine; Bunway does not wrap its API or provide authorization.

## Generate authentication

The recommended browser setup uses email/password, a database-backed session, and Better Auth's secure HttpOnly cookie:

```sh
bunway g auth --password
bunway db:migrate
```

The generator updates both package manifests and immediately runs `bun install` when the application
already has `node_modules` (the normal `bun create bunway` workflow). In a source-only app it tells you
to run `bun install` yourself. Auth imports stay on Auth-owned pages; the global sidebar contains only
a plain `/account` link, so an Auth configuration error does not take down unrelated resource pages.

Interactive `bunway g auth` asks about supported methods. Automation can combine flags:

```sh
bunway g auth --password --magic-link \
  --oauth=google,github \
  --mfa=totp,backup-codes,email-otp,trusted-devices
```

Other supported flags are `--passkeys`, `--bearer`, `--api-key`, and `--database=accounts`. Bearer tokens and API keys are intended for non-browser API clients; the generated browser UI continues to use cookies.

The generator creates ordinary Better Auth configuration, a Drizzle schema, an Elysia plugin and protected route example, and Svelte pages for the selected features. Pass `--database=<name>` to use any configured PostgreSQL, MySQL, or SQLite Drizzle database.

## Environment

Generate a high-entropy secret of at least 32 characters and copy the generated `.env.example` values into `.env`:

```dotenv
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
WEB_ORIGIN=http://localhost:5173
AUTH_APP_NAME=Bunway App
```

The API mounts Better Auth at `/api/auth/*`. The generated Elysia macro makes protected routes explicit:

```ts
new Elysia()
  .use(authPlugin)
  .get('/account', ({ user, session }) => ({ user, session }), { auth: true })
```

## OAuth

Selected providers add empty credential variables. Configure these callback URLs in the provider console:

| Provider  | Variables                                        | Local callback URL                                  |
| --------- | ------------------------------------------------ | --------------------------------------------------- |
| Google    | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`       | `http://localhost:3000/api/auth/callback/google`    |
| GitHub    | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`       | `http://localhost:3000/api/auth/callback/github`    |
| Microsoft | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | `http://localhost:3000/api/auth/callback/microsoft` |
| Apple     | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`         | `http://localhost:3000/api/auth/callback/apple`     |

In development, a selected provider with missing credentials is disabled and concise setup guidance is logged. No secrets are logged. Set the production origin instead of the local URLs when deploying.

## Authentication mail

Magic links, email OTP, and email-based MFA use Bunway Mail through `mail.send()`. There is no separate Auth transport. With no provider in development, the Mail console driver displays the local testing link or code while Audit records only outcome metadata—not the body, token, URL, or OTP. Production requires Resend or SMTP and never falls back to console delivery. See [Messaging](./messaging.md).

A magic-link or OAuth callback first reaches the API because Better Auth must verify the token or provider response there. The generated browser sign-in page supplies its absolute `window.location.origin` as the final callback, so successful sign-in returns to the Svelte UI even when `BETTER_AUTH_URL` points at a separate API origin. API-only clients can omit `callbackURL` to remain on the API or pass their own absolute destination. Keep the API origin in OAuth provider consoles; it is the verification endpoint, not the final page shown to the user.

## MFA and passkeys

`--mfa=totp,backup-codes` generates Better Auth's two-factor plugin and a security page. Enabling TOTP renders a QR code plus Better Auth's setup URI and one-time recovery codes; the user verifies an authenticator code before MFA becomes active. `trusted-devices` uses Better Auth's `trustDevice` option. `email-otp` shares the development mail hook.

`--passkeys` installs Better Auth's official WebAuthn plugin and adds passkey sign-in and registration. Localhost is a valid development relying-party ID; configure `AUTH_RP_ID` and `WEB_ORIGIN` for production.

Better Auth applies its normal two-factor challenge to credential sign-in. Its current default does not automatically challenge OAuth, magic-link, email-OTP, or passkey sign-ins; applications needing that policy should add Better Auth hooks explicitly. That policy is not hidden by Bunway.

## Schema and migrations

The generated `src/db/schema/auth.ts` is the database source of truth and includes only tables needed by selected plugins. Use the normal workflow:

```sh
bunway db:migrate
```

Do not also run Better Auth migrations. When upgrading Better Auth or changing plugins, use Better Auth's schema documentation/CLI to update the application-owned Drizzle schema, then use Drizzle Kit through `bunway db:migrate`.

## Test application

The [finished Showcase](./showcase/index.md) enables password, magic link, Google/GitHub/Microsoft/Apple OAuth, TOTP, backup codes, email OTP, trusted devices, and passkeys. Its seed creates these local credential accounts:

```text
demo@example.com      / BunwayDemo123!
security@example.com  / BunwayDemo123!
```

Run migrations before seeding. OAuth still requires real provider credentials; development does not fake an OAuth success.

## Deferred behavior

Password reset is supported by Better Auth but the first scaffold does not generate reset pages. Authorization (roles, permissions, policies, organizations, and tenancy) remains a separate future capability.
