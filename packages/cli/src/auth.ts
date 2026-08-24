import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { format } from "prettier";
import * as sveltePlugin from "prettier-plugin-svelte";
import { database, databaseDirectory } from "./databases";
import { CliError, insertBefore, run } from "./utils";
import { ensureMessaging } from "./messaging";

export const authProviders = [
  "google",
  "github",
  "microsoft",
  "apple",
] as const;
export const authMfaMethods = [
  "totp",
  "backup-codes",
  "email-otp",
  "trusted-devices",
] as const;
export type AuthProvider = (typeof authProviders)[number];
export type AuthMfaMethod = (typeof authMfaMethods)[number];

export type AuthOptions = {
  password?: boolean;
  magicLink?: boolean;
  passkeys?: boolean;
  bearer?: boolean;
  apiKey?: boolean;
  oauth?: AuthProvider[];
  mfa?: AuthMfaMethod[];
  database?: string;
  apiOnly?: boolean;
};

async function write(path: string, source: string) {
  if (await Bun.file(path).exists())
    throw new CliError(`${path} already exists`);
  await mkdir(join(path, ".."), { recursive: true });
  const parser = path.endsWith(".svelte")
    ? "svelte"
    : path.endsWith(".ts")
      ? "typescript"
      : undefined;
  const content = parser
    ? await format(source, {
        parser,
        plugins: parser === "svelte" ? [sveltePlugin] : [],
        printWidth: 100,
        semi: false,
        singleQuote: true,
      })
    : source;
  await Bun.write(path, content);
  console.log(`create ${path}`);
}

function parseList<T extends string>(
  values: string[],
  allowed: readonly T[],
  label: string,
): T[] {
  const unique = [...new Set(values.filter(Boolean))];
  const invalid = unique.filter((value) => !allowed.includes(value as T));
  if (invalid.length)
    throw new CliError(
      `${label} must be one or more of: ${allowed.join(", ")}`,
    );
  return unique as T[];
}

export function normalizeAuthOptions(
  options: AuthOptions,
): Required<AuthOptions> {
  const oauth = parseList(
    options.oauth ?? [],
    authProviders,
    "OAuth providers",
  );
  const mfa = parseList(options.mfa ?? [], authMfaMethods, "MFA methods");
  const password =
    options.password ??
    (!options.magicLink && !options.passkeys && !oauth.length);
  if (mfa.length && !password)
    throw new CliError(
      "MFA currently protects email/password sign-in; add --password or remove --mfa",
    );
  if (mfa.includes("backup-codes") && !mfa.includes("totp"))
    throw new CliError(
      "backup-codes requires totp; use --mfa=totp,backup-codes",
    );
  return {
    password,
    magicLink: options.magicLink ?? false,
    passkeys: options.passkeys ?? false,
    bearer: options.bearer ?? false,
    apiKey: options.apiKey ?? false,
    oauth,
    mfa,
    database: options.database ?? "primary",
    apiOnly: options.apiOnly ?? false,
  };
}

const envNames: Record<AuthProvider, string> = {
  google: "GOOGLE",
  github: "GITHUB",
  microsoft: "MICROSOFT",
  apple: "APPLE",
};

function schemaSource(
  adapter: "postgres" | "mysql" | "sqlite",
  options: Required<AuthOptions>,
) {
  const mysql = adapter === "mysql";
  const sqlite = adapter === "sqlite";
  const core = sqlite ? "sqlite-core" : mysql ? "mysql-core" : "pg-core";
  const table = sqlite ? "sqliteTable" : mysql ? "mysqlTable" : "pgTable";
  const string = (name: string, column = name) =>
    mysql ? `varchar('${column}', { length: 255 })` : `text('${column}')`;
  const date = (name: string) =>
    sqlite
      ? `integer('${name}', { mode: 'timestamp' })`
      : `timestamp('${name}')`;
  const bool = (name: string) =>
    sqlite ? `integer('${name}', { mode: 'boolean' })` : `boolean('${name}')`;
  const updated = sqlite
    ? ".notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date())"
    : ".defaultNow().notNull().$onUpdate(() => new Date())";
  const created = sqlite
    ? ".notNull().$defaultFn(() => new Date())"
    : ".defaultNow().notNull()";
  const imports = [
    table,
    "index",
    "uniqueIndex",
    "integer",
    ...(sqlite
      ? ["text"]
      : mysql
        ? ["varchar", "timestamp", "boolean", "text"]
        : ["text", "timestamp", "boolean"]),
  ];
  const twoFactor = options.mfa.includes("totp");
  const passkey = options.passkeys;
  const apiKey = options.apiKey;
  return `import { relations } from 'drizzle-orm'
import { ${[...new Set(imports)].join(", ")} } from 'drizzle-orm/${core}'

export const user = ${table}('user', {
  id: ${string("id")}.primaryKey(),
  name: ${string("name")}.notNull(),
  email: ${string("email")}.notNull().unique(),
  emailVerified: ${bool("email_verified")}.default(false).notNull(),
  image: ${string("image")},
  createdAt: ${date("created_at")}${created},
  updatedAt: ${date("updated_at")}${updated},${
    twoFactor
      ? `
  twoFactorEnabled: ${bool("two_factor_enabled")}.default(false),`
      : ""
  }
})

export const session = ${table}('session', {
  id: ${string("id")}.primaryKey(),
  expiresAt: ${date("expires_at")}.notNull(),
  token: ${string("token")}.notNull().unique(),
  createdAt: ${date("created_at")}${created},
  updatedAt: ${date("updated_at")}${updated},
  ipAddress: ${string("ip_address")},
  userAgent: ${string("user_agent")},
  userId: ${string("user_id")}.notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [index('session_userId_idx').on(table.userId)])

export const account = ${table}('account', {
  id: ${string("id")}.primaryKey(),
  issuer: ${string("issuer")}.notNull(),
  accountId: ${string("account_id")}.notNull(),
  providerId: ${string("provider_id")}.notNull(),
  userId: ${string("user_id")}.notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: ${mysql ? "text('access_token')" : string("access_token")},
  refreshToken: ${mysql ? "text('refresh_token')" : string("refresh_token")},
  idToken: ${mysql ? "text('id_token')" : string("id_token")},
  accessTokenExpiresAt: ${date("access_token_expires_at")},
  refreshTokenExpiresAt: ${date("refresh_token_expires_at")},
  scope: ${string("scope")},
  password: ${mysql ? "text('password')" : string("password")},
  createdAt: ${date("created_at")}${created},
  updatedAt: ${date("updated_at")}${updated},
}, (table) => [
  ${mysql ? "uniqueIndex" : "uniqueIndex"}('account_issuer_accountId_uidx').on(table.issuer, table.accountId),
  index('account_userId_idx').on(table.userId),
])

export const verification = ${table}('verification', {
  id: ${string("id")}.primaryKey(),
  identifier: ${string("identifier")}.notNull(),
  value: ${mysql ? "text('value')" : string("value")}.notNull(),
  expiresAt: ${date("expires_at")}.notNull(),
  createdAt: ${date("created_at")}${created},
  updatedAt: ${date("updated_at")}${updated},
}, (table) => [index('verification_identifier_idx').on(table.identifier)])
${
  twoFactor
    ? `
export const twoFactor = ${table}('two_factor', {
  id: ${string("id")}.primaryKey(),
  secret: ${string("secret")}.notNull(),
  backupCodes: ${mysql ? "text('backup_codes')" : string("backup_codes")}.notNull(),
  userId: ${string("user_id")}.notNull().references(() => user.id, { onDelete: 'cascade' }),
  verified: ${bool("verified")}.default(true),
  failedVerificationCount: integer('failed_verification_count').default(0),
  lockedUntil: ${date("locked_until")},
}, (table) => [index('twoFactor_secret_idx').on(table.secret), index('twoFactor_userId_idx').on(table.userId)])
`
    : ""
}${
    passkey
      ? `
export const passkey = ${table}('passkey', {
  id: ${string("id")}.primaryKey(),
  name: ${string("name")},
  publicKey: ${mysql ? "text('public_key')" : string("public_key")}.notNull(),
  userId: ${string("user_id")}.notNull().references(() => user.id, { onDelete: 'cascade' }),
  credentialID: ${string("credential_id")}.notNull(),
  counter: integer('counter').notNull(),
  deviceType: ${string("device_type")}.notNull(),
  backedUp: ${bool("backed_up")}.notNull(),
  transports: ${string("transports")},
  createdAt: ${date("created_at")},
  aaguid: ${string("aaguid")},
}, (table) => [index('passkey_userId_idx').on(table.userId), index('passkey_credentialID_idx').on(table.credentialID)])
`
      : ""
  }${
    apiKey
      ? `
export const apikey = ${table}('apikey', {
  id: ${string("id")}.primaryKey(), configId: ${string("config_id")}.default('default').notNull(), name: ${string("name")},
  start: ${string("start")}, referenceId: ${string("reference_id")}.notNull(), prefix: ${string("prefix")}, key: ${string("key")}.notNull(),
  refillInterval: integer('refill_interval'), refillAmount: integer('refill_amount'), lastRefillAt: ${date("last_refill_at")},
  enabled: ${bool("enabled")}.default(true), rateLimitEnabled: ${bool("rate_limit_enabled")}.default(true),
  rateLimitTimeWindow: integer('rate_limit_time_window').default(86400000), rateLimitMax: integer('rate_limit_max').default(10),
  requestCount: integer('request_count').default(0), remaining: integer('remaining'), lastRequest: ${date("last_request")},
  expiresAt: ${date("expires_at")}, createdAt: ${date("created_at")}.notNull(), updatedAt: ${date("updated_at")}.notNull(),
  permissions: ${mysql ? "text('permissions')" : string("permissions")}, metadata: ${mysql ? "text('metadata')" : string("metadata")},
}, (table) => [index('apikey_configId_idx').on(table.configId), index('apikey_referenceId_idx').on(table.referenceId), index('apikey_key_idx').on(table.key)])
`
      : ""
  }
export const userRelations = relations(user, ({ many }) => ({ sessions: many(session), accounts: many(account)${twoFactor ? ", twoFactors: many(twoFactor)" : ""}${passkey ? ", passkeys: many(passkey)" : ""} }))
export const sessionRelations = relations(session, ({ one }) => ({ user: one(user, { fields: [session.userId], references: [user.id] }) }))
export const accountRelations = relations(account, ({ one }) => ({ user: one(user, { fields: [account.userId], references: [user.id] }) }))
${twoFactor ? "export const twoFactorRelations = relations(twoFactor, ({ one }) => ({ user: one(user, { fields: [twoFactor.userId], references: [user.id] }) }))" : ""}
${passkey ? "export const passkeyRelations = relations(passkey, ({ one }) => ({ user: one(user, { fields: [passkey.userId], references: [user.id] }) }))" : ""}
`;
}

function authSource(options: Required<AuthOptions>) {
  const dbName = options.database === "primary" ? "db" : options.database;
  const schemaPath =
    options.database === "primary"
      ? "../db/schema/auth"
      : `../db/${options.database}/schema/auth`;
  const plugins = [
    options.magicLink
      ? `magicLink({ sendMagicLink: async ({ email, url }) => sendAuthEmail({ to: email, subject: 'Sign in to Bunway', text: \`Magic link:\\n\${url}\` }) })`
      : "",
    options.mfa.includes("totp")
      ? `twoFactor({${options.mfa.includes("email-otp") ? ` otpOptions: { sendOTP: async ({ user, otp }) => sendAuthEmail({ to: user.email, subject: 'Your security code', text: \`Code: \${otp}\` }) }` : ""} })`
      : "",
    options.mfa.includes("email-otp")
      ? `emailOTP({ sendVerificationOTP: async ({ email, otp, type }) => sendAuthEmail({ to: email, subject: \`Bunway \${type} code\`, text: \`Code: \${otp}\` }) })`
      : "",
    options.passkeys
      ? `passkey({ rpID: Bun.env.AUTH_RP_ID ?? 'localhost', rpName: Bun.env.AUTH_APP_NAME ?? 'Bunway App', origin: Bun.env.WEB_ORIGIN ?? 'http://localhost:5173' })`
      : "",
    options.bearer ? "bearer()" : "",
    options.apiKey ? "apiKey()" : "",
  ].filter(Boolean);
  const pluginImports = [
    options.magicLink ? "magicLink" : "",
    options.mfa.includes("totp") ? "twoFactor" : "",
    options.mfa.includes("email-otp") ? "emailOTP" : "",
    options.bearer ? "bearer" : "",
  ].filter(Boolean);
  const social = options.oauth
    .map((provider) => {
      const env = envNames[provider];
      return `    ${provider}: oauthProvider('${provider}', Bun.env.${env}_CLIENT_ID, Bun.env.${env}_CLIENT_SECRET),`;
    })
    .join("\n");
  return `import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
${pluginImports.length ? `import { ${pluginImports.join(", ")} } from 'better-auth/plugins'\n` : ""}${options.passkeys ? "import { passkey } from '@better-auth/passkey'\n" : ""}${options.apiKey ? "import { apiKey } from '@better-auth/api-key'\n" : ""}import { ${dbName} } from '../db'
import * as schema from '${schemaPath}'
${options.magicLink || options.mfa.includes("email-otp") ? "import { sendAuthEmail } from './mail'\n" : ""}import { oauthProvider } from './oauth'

export const auth = betterAuth({
  appName: Bun.env.AUTH_APP_NAME ?? 'Bunway App',
  baseURL: Bun.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  trustedOrigins: [Bun.env.WEB_ORIGIN ?? 'http://localhost:5173'],
  database: drizzleAdapter(${dbName}, { provider: '${options.database}', schema }),
  emailAndPassword: { enabled: ${options.password}, minPasswordLength: 8 },
  socialProviders: {
${social}
  },
  plugins: [${plugins.join(",\n    ")}],
})
`;
}

const oauthSource = `const labels = { google: 'Google', github: 'GitHub', microsoft: 'Microsoft', apple: 'Apple' } as const

export function oauthProvider(provider: keyof typeof labels, clientId?: string, clientSecret?: string) {
  if (clientId && clientSecret) return { clientId, clientSecret }
  if (Bun.env.NODE_ENV === 'production') return undefined
  console.warn(\`[Bunway Auth] \${labels[provider]} OAuth is selected but credentials are missing. Set \${provider.toUpperCase()}_CLIENT_ID and \${provider.toUpperCase()}_CLIENT_SECRET, then configure http://localhost:3000/api/auth/callback/\${provider}. The provider is disabled until configured.\`)
  return undefined
}
`;

const mailSource = `import { mail } from '../messaging'

export type AuthEmail = { to: string; subject: string; text: string }

export async function sendAuthEmail(message: AuthEmail) {
  await mail.send(message)
}
`;

const pluginSource = `import { Elysia } from 'elysia'
import { auth } from './index'

export const authPlugin = new Elysia({ name: 'better-auth' })
  .mount(auth.handler)
  .macro({
    auth: {
      async resolve({ request: { headers }, status }) {
        const identity = await auth.api.getSession({ headers })
        if (!identity) return status(401, { error: 'Authentication required' })
        return { user: identity.user, session: identity.session }
      },
    },
  })
`;

function clientSource(options: Required<AuthOptions>) {
  const plugins = [
    options.magicLink ? "magicLinkClient()" : "",
    options.mfa.includes("totp") ? "twoFactorClient()" : "",
    options.mfa.includes("email-otp") ? "emailOTPClient()" : "",
    options.passkeys ? "passkeyClient()" : "",
    options.apiKey ? "apiKeyClient()" : "",
  ].filter(Boolean);
  const imports = [
    options.magicLink ? "magicLinkClient" : "",
    options.mfa.includes("totp") ? "twoFactorClient" : "",
    options.mfa.includes("email-otp") ? "emailOTPClient" : "",
  ].filter(Boolean);
  return `import { createAuthClient } from 'better-auth/svelte'
${imports.length ? `import { ${imports.join(", ")} } from 'better-auth/client/plugins'\n` : ""}${options.passkeys ? "import { passkeyClient } from '@better-auth/passkey/client'\n" : ""}${options.apiKey ? "import { apiKeyClient } from '@better-auth/api-key/client'\n" : ""}
export const authClient = createAuthClient({
  baseURL: 'http://localhost:3000',
  plugins: [${plugins.join(", ")}],
})
`;
}

function loginPage(options: Required<AuthOptions>) {
  return `<script lang="ts">
  import { goto } from '$app/navigation'
  import { authClient } from '$lib/auth-client'
  let email = $state('')
  let password = $state('')
  let code = $state('')
  let error = $state('')
  let needsTwoFactor = $state(false)
  let factor = $state<'totp' | 'backup' | 'otp'>('totp')
  const browserCallbackURL = () => new URL('/', window.location.origin).toString()
  async function signIn() {
    error = ''
    const result = await authClient.signIn.email({ email, password })
    if (result.error) return error = result.error.message ?? 'Sign in failed'
    if ((result.data as { twoFactorRedirect?: boolean })?.twoFactorRedirect) return needsTwoFactor = true
    await goto('/')
  }
  async function verify() {
    const result = factor === 'backup'
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice: true })
      : factor === 'otp'
        ? await authClient.twoFactor.verifyOtp({ code, trustDevice: true })
        : await authClient.twoFactor.verifyTotp({ code, trustDevice: true })
    if (result.error) return error = result.error.message ?? 'Invalid code'
    await goto('/')
  }
  async function sendOtp() {
    factor = 'otp'
    const result = await authClient.twoFactor.sendOtp({ trustDevice: true })
    error = result.error?.message ?? 'Check your email or the development server console.'
  }
  async function magicLink() {
    const result = await authClient.signIn.magicLink({ email, callbackURL: browserCallbackURL() })
    error = result.error?.message ?? 'Check your email or the development server console.'
  }
</script>
<svelte:head><title>Sign in</title></svelte:head>
<main class="mx-auto max-w-md space-y-6 p-8"><h1 class="text-3xl font-semibold">Sign in</h1>
{#if error}<p class="rounded border p-3 text-sm">{error}</p>{/if}
${options.password ? `{#if needsTwoFactor}<form class="space-y-4" onsubmit={(event) => { event.preventDefault(); verify() }}><label class="block">{factor === 'backup' ? 'Recovery code' : factor === 'otp' ? 'Email code' : 'Authenticator code'}<input class="mt-1 w-full rounded border bg-background p-2" bind:value={code} autocomplete="one-time-code" /></label><button class="w-full rounded bg-primary p-2 text-primary-foreground">Verify</button></form><div class="flex flex-wrap gap-2"><button class="rounded border px-3 py-2" onclick={() => factor = 'totp'}>Authenticator</button>${options.mfa.includes("backup-codes") ? `<button class="rounded border px-3 py-2" onclick={() => factor = 'backup'}>Recovery code</button>` : ""}${options.mfa.includes("email-otp") ? `<button class="rounded border px-3 py-2" onclick={sendOtp}>Email a code</button>` : ""}</div>{:else}<form class="space-y-4" onsubmit={(event) => { event.preventDefault(); signIn() }}><label class="block">Email<input class="mt-1 w-full rounded border bg-background p-2" type="email" bind:value={email} autocomplete="email" required /></label><label class="block">Password<input class="mt-1 w-full rounded border bg-background p-2" type="password" bind:value={password} autocomplete="current-password" required /></label><button class="w-full rounded bg-primary p-2 text-primary-foreground">Sign in</button></form>{/if}` : ""}
${options.oauth.map((provider) => `<button class="w-full rounded border p-2" onclick={() => authClient.signIn.social({ provider: '${provider}', callbackURL: browserCallbackURL() })}>Continue with ${provider[0]!.toUpperCase() + provider.slice(1)}</button>`).join("\n")}
${options.magicLink ? `<form class="space-y-3 border-t pt-4" onsubmit={(event) => { event.preventDefault(); magicLink() }}><label class="block">Email for magic link<input class="mt-1 w-full rounded border bg-background p-2" type="email" bind:value={email} required /></label><button class="w-full rounded border p-2">Send magic link</button></form>` : ""}
${options.passkeys ? `<button class="w-full rounded border p-2" onclick={() => authClient.signIn.passkey()}>Sign in with a passkey</button>` : ""}
${options.password ? `<p class="text-sm">No account? <a class="underline" href="/register">Create one</a></p>` : ""}</main>`;
}

const registerPage = `<script lang="ts">
  import { goto } from '$app/navigation'
  import { authClient } from '$lib/auth-client'
  let name = $state(''), email = $state(''), password = $state(''), confirmation = $state(''), error = $state('')
  async function register() {
    if (password !== confirmation) return error = 'Passwords do not match'
    const result = await authClient.signUp.email({ name, email, password })
    if (result.error) return error = result.error.message ?? 'Registration failed'
    await goto('/')
  }
</script>
<main class="mx-auto max-w-md space-y-6 p-8"><h1 class="text-3xl font-semibold">Create account</h1>{#if error}<p class="rounded border p-3">{error}</p>{/if}<form class="space-y-4" onsubmit={(event) => { event.preventDefault(); register() }}><label class="block">Name<input class="mt-1 w-full rounded border bg-background p-2" bind:value={name} autocomplete="name" required /></label><label class="block">Email<input class="mt-1 w-full rounded border bg-background p-2" type="email" bind:value={email} autocomplete="email" required /></label><label class="block">Password<input class="mt-1 w-full rounded border bg-background p-2" type="password" bind:value={password} minlength="8" required /></label><label class="block">Confirm password<input class="mt-1 w-full rounded border bg-background p-2" type="password" bind:value={confirmation} minlength="8" required /></label><button class="w-full rounded bg-primary p-2 text-primary-foreground">Create account</button></form></main>`;

function securityPage(options: Required<AuthOptions>) {
  return `<script lang="ts">
  import { authClient } from '$lib/auth-client'
  ${options.mfa.includes("totp") ? "import QRCode from 'qrcode'" : ""}
  let password = $state(''), code = $state(''), totpURI = $state(''), qrCode = $state(''), backupCodes = $state<string[]>([]), message = $state('')
  async function enableTotp() {
    const result = await authClient.twoFactor.enable({ password, issuer: 'Bunway App' })
    if (result.error) return message = result.error.message ?? 'Could not begin setup'
    if (result.data.method !== 'totp') return message = 'Authenticator setup was not returned.'
    totpURI = result.data.totpURI; qrCode = await QRCode.toDataURL(totpURI); backupCodes = result.data.backupCodes
  }
  async function verifyTotp() {
    const result = await authClient.twoFactor.verifyTotp({ code })
    message = result.error?.message ?? 'Authenticator app enabled.'
  }
</script>
<main class="mx-auto max-w-2xl space-y-6 p-8"><h1 class="text-3xl font-semibold">Account Security</h1>
${options.mfa.includes("totp") ? `<section class="space-y-3 rounded border p-5"><h2 class="text-xl font-medium">Authenticator app</h2><label class="block">Current password<input class="mt-1 w-full rounded border bg-background p-2" type="password" bind:value={password} /></label><button class="rounded bg-primary px-4 py-2 text-primary-foreground" onclick={enableTotp}>Enable</button>{#if totpURI}<img class="size-48 rounded bg-white p-2" src={qrCode} alt="Authenticator setup QR code" /><p class="break-all text-sm">Manual setup URI: {totpURI}</p><label class="block">Code<input class="mt-1 w-full rounded border bg-background p-2" bind:value={code} /></label><button class="rounded border px-4 py-2" onclick={verifyTotp}>Verify</button>{/if}</section>` : ""}
${options.mfa.includes("backup-codes") ? `<section class="rounded border p-5"><h2 class="text-xl font-medium">Recovery codes</h2>{#if backupCodes.length}<ul class="mt-3 grid grid-cols-2 gap-2 font-mono">{#each backupCodes as backupCode}<li>{backupCode}</li>{/each}</ul><p class="mt-3 text-sm">Store these once in a secure place.</p>{:else}<p class="text-sm">Recovery codes appear once during authenticator setup.</p>{/if}</section>` : ""}
${options.passkeys ? `<section class="space-y-3 rounded border p-5"><h2 class="text-xl font-medium">Passkeys</h2><button class="rounded border px-4 py-2" onclick={async () => { const result = await authClient.passkey.addPasskey({ name: 'My passkey' }); message = result.error?.message ?? 'Passkey added.' }}>Add passkey</button></section>` : ""}
{#if message}<p>{message}</p>{/if}</main>`;
}

const accountPage = `<script lang="ts">
  import { goto } from '$app/navigation'
  import { authClient } from '$lib/auth-client'
  const session = authClient.useSession()
  async function signOut() { await authClient.signOut(); await goto('/login') }
</script>
<main class="mx-auto max-w-2xl space-y-6 p-8"><h1 class="text-3xl font-semibold">Account</h1>{#if $session.isPending}<p>Loading…</p>{:else if $session.data}<p>Signed in as {$session.data.user.name} ({$session.data.user.email}).</p><div class="flex gap-3"><a class="rounded border px-4 py-2" href="/account/security">Security</a><button class="rounded border px-4 py-2" onclick={signOut}>Sign out</button></div>{:else}<p>You are not signed in. <a class="underline" href="/login">Sign in</a></p>{/if}</main>`;

const protectedRoute = `import { Elysia } from 'elysia'
import { authPlugin } from '../auth/plugin'
export const accountRoutes = new Elysia({ prefix: '/account' }).use(authPlugin).get('/', ({ user, session }) => ({ user, session }), { auth: true })
`;

export async function generateAuth(raw: AuthOptions, cwd = process.cwd()) {
  const options = normalizeAuthOptions(raw);
  const selected = await database(options.database, cwd);
  const schemaRoot = join(cwd, databaseDirectory(options.database), "schema");
  await write(
    join(schemaRoot, "auth.ts"),
    schemaSource(selected.adapter, options),
  );
  await insertBefore(
    join(schemaRoot, "index.ts"),
    "// bunway:schemas",
    `export * from './auth'`,
  );
  await write(
    join(cwd, "src/auth/index.ts"),
    authSource(options).replace(
      `provider: '${options.database}'`,
      `provider: '${selected.adapter === "postgres" ? "pg" : selected.adapter}'`,
    ),
  );
  await write(join(cwd, "src/auth/oauth.ts"), oauthSource);
  if (options.magicLink || options.mfa.includes("email-otp")) {
    await ensureMessaging(cwd);
    await write(join(cwd, "src/auth/mail.ts"), mailSource);
  }
  await write(join(cwd, "src/auth/plugin.ts"), pluginSource);
  await write(join(cwd, "src/routes/account.ts"), protectedRoute);
  await insertBefore(
    join(cwd, "src/routes/index.ts"),
    "// bunway:imports",
    `import { accountRoutes } from './account'`,
  );
  await insertBefore(
    join(cwd, "src/routes/index.ts"),
    "// bunway:routes",
    "  .use(accountRoutes)",
  );
  const appPath = join(cwd, "src/app.ts");
  let app = await Bun.file(appPath).text();
  if (!app.includes("from './auth/plugin'"))
    app = app.replace(
      "import { Elysia } from 'elysia'",
      "import { Elysia } from 'elysia'\nimport { authPlugin } from './auth/plugin'",
    );
  app = app.replace(
    /cors\(\{ origin: ([^}]+) \}\)/,
    "cors({ origin: $1, credentials: true })",
  );
  app = app.replace(".use(routes)", ".use(authPlugin)\n  .use(routes)");
  await Bun.write(
    appPath,
    await format(app, { parser: "typescript", semi: false, singleQuote: true }),
  );
  const manifestPath = join(cwd, "package.json");
  const manifest = await Bun.file(manifestPath).json();
  manifest.dependencies["better-auth"] = "^1.7.1";
  manifest.dependencies["@better-auth/drizzle-adapter"] = "^1.7.1";
  if (options.passkeys)
    manifest.dependencies["@better-auth/passkey"] = "^1.7.1";
  if (options.apiKey) manifest.dependencies["@better-auth/api-key"] = "^1.7.1";
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const envPath = join(cwd, ".env.example");
  let env =
    (await Bun.file(envPath).text()).trimEnd() +
    "\nBETTER_AUTH_SECRET=generate-at-least-32-random-characters\nBETTER_AUTH_URL=http://localhost:3000\nWEB_ORIGIN=http://localhost:5173\nAUTH_APP_NAME=Bunway App\n";
  for (const provider of options.oauth) {
    const name = envNames[provider];
    env += `${name}_CLIENT_ID=\n${name}_CLIENT_SECRET=\n`;
  }
  await Bun.write(envPath, env);
  if (!options.apiOnly) {
    const webManifestPath = join(cwd, "web/package.json");
    const webManifest = await Bun.file(webManifestPath).json();
    webManifest.dependencies["better-auth"] = "^1.7.1";
    if (options.passkeys)
      webManifest.dependencies["@better-auth/passkey"] = "^1.7.1";
    if (options.apiKey)
      webManifest.dependencies["@better-auth/api-key"] = "^1.7.1";
    await Bun.write(
      webManifestPath,
      `${JSON.stringify(webManifest, null, 2)}\n`,
    );
    await write(join(cwd, "web/src/lib/auth-client.ts"), clientSource(options));
    await write(
      join(cwd, "web/src/routes/login/+page.svelte"),
      loginPage(options),
    );
    if (options.password)
      await write(
        join(cwd, "web/src/routes/register/+page.svelte"),
        registerPage,
      );
    if (options.mfa.length || options.passkeys)
      await write(
        join(cwd, "web/src/routes/account/security/+page.svelte"),
        securityPage(options),
      );
    await write(join(cwd, "web/src/routes/account/+page.svelte"), accountPage);
    if (options.mfa.includes("totp")) {
      webManifest.dependencies.qrcode = "^1.5.4";
      webManifest.devDependencies["@types/qrcode"] = "^1.5.6";
      await Bun.write(
        webManifestPath,
        `${JSON.stringify(webManifest, null, 2)}\n`,
      );
    }
    const sidebarPath = join(cwd, "web/src/lib/components/app-sidebar.svelte");
    let sidebar = await Bun.file(sidebarPath).text();
    sidebar = sidebar
      .replace(/\s*import \{ authClient \} from ['"]\$lib\/auth-client['"];?/, "")
      .replace(/\s*const authSession = authClient\.useSession\(\);?/, "");
    sidebar = sidebar.replace(
      '<Sidebar.Footer><p class="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">Generated with Bunway</p></Sidebar.Footer>',
      `<Sidebar.Footer><Sidebar.Menu><Sidebar.MenuItem><Sidebar.MenuButton tooltipContent="Account" isActive={isActive('/account')}>{#snippet child({ props })}<a href="/account" {...props}><RiUser3Line /><span class="group-data-[collapsible=icon]:hidden">Account</span></a>{/snippet}</Sidebar.MenuButton></Sidebar.MenuItem></Sidebar.Menu><p class="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">Generated with Bunway</p></Sidebar.Footer>`,
    );
    sidebar = sidebar.replace(
      /<Sidebar\.Footer><Sidebar\.Menu><Sidebar\.MenuItem><Sidebar\.MenuButton tooltipContent=\{\$authSession[\s\S]*?<\/Sidebar\.Footer>/,
      `<Sidebar.Footer><Sidebar.Menu><Sidebar.MenuItem><Sidebar.MenuButton tooltipContent="Account" isActive={isActive('/account')}>{#snippet child({ props })}<a href="/account" {...props}><RiUser3Line /><span class="group-data-[collapsible=icon]:hidden">Account</span></a>{/snippet}</Sidebar.MenuButton></Sidebar.MenuItem></Sidebar.Menu><p class="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">Generated with Bunway</p></Sidebar.Footer>`,
    );
    await Bun.write(
      sidebarPath,
      await format(sidebar, {
        parser: "svelte",
        plugins: [sveltePlugin],
        printWidth: 100,
        semi: false,
        singleQuote: true,
      }),
    );
  }
  const installed = existsSync(join(cwd, "node_modules"));
  if (installed) await run(["bun", "install"], cwd);
  console.log(
    `\nAuthentication generated for database "${options.database}". ${installed ? "Dependencies installed." : "Run bun install."} Set BETTER_AUTH_SECRET, then run bunway db:migrate.`,
  );
}
