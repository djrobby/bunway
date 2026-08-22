import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createProject } from "../packages/cli/src/project";
import {
  generateJob,
  generateModel,
  generateRealtime,
  generateResource,
} from "../packages/cli/src/generate";
import { generateMailer, generateSms } from "../packages/cli/src/messaging";
import {
  developmentCommands,
  developmentNotice,
} from "../packages/cli/src/dev";
import { consoleCommand } from "../packages/cli/src/console";
import {
  addDatabase,
  databaseConfig,
  migrateDatabases,
  migrationError,
} from "../packages/cli/src/databases";
import { generateAuth, normalizeAuthOptions } from "../packages/cli/src/auth";
import { generateAudit } from "../packages/cli/src/audit";
import { cliVersion } from "../packages/cli/src/version";

async function app() {
  const root = await mkdtemp(join(tmpdir(), "bunway-"));
  const path = join(root, "shop");
  await createProject(path, { install: false });
  return path;
}

describe("critical generation flow", () => {
  test("reports the PostgreSQL error hidden by stable Drizzle Kit migrate", () => {
    const cause = Object.assign(
      new Error('relation "products" already exists'),
      {
        code: "42P07",
        detail: "A relation with that name already exists.",
        hint: "Reconcile the database migration history.",
      },
    );
    const error = new Error("Failed query: CREATE TABLE products", { cause });
    expect(migrationError(error)).toContain(
      'Migration failed: relation "products" already exists',
    );
    expect(migrationError(error)).toContain("Database error 42P07");
    expect(migrationError(error)).toContain(
      "A relation with that name already exists.",
    );
    expect(migrationError(error)).toContain("already contains this table");
  });
  test("reports the installed CLI package version", async () => {
    const manifest = await Bun.file(
      join(import.meta.dir, "../packages/cli/package.json"),
    ).json();
    expect(await cliVersion()).toBe(manifest.version);
  });

  test("starts the web workspace with Bun run argument ordering", () => {
    expect(developmentCommands[1]).toEqual([
      "bun",
      "run",
      "--bun",
      "--cwd",
      "web",
      "dev",
    ]);
    expect(developmentNotice("4000")).toContain("API: http://localhost:4000");
    expect(developmentNotice()).toContain(
      "restart bunway dev after changing .env",
    );
  });

  test("starts a native Bun console with the application preload", () => {
    const command = consoleCommand();
    expect(command[0]).toBe("bun");
    expect(command[1]).toBe("repl");
  });

  test("creates an understandable application", async () => {
    const path = await app();
    expect(await Bun.file(join(path, "src/app.ts")).exists()).toBe(true);
    expect(
      await Bun.file(join(path, "web/src/routes/+page.svelte")).exists(),
    ).toBe(true);
    expect(
      await Bun.file(
        join(path, "web/src/lib/components/theme-toggle.svelte"),
      ).text(),
    ).toContain("cycleTheme");
    expect(
      await Bun.file(
        join(path, "web/src/lib/components/ui/sidebar/sidebar-provider.svelte"),
      ).text(),
    ).toContain("bunway-sidebar-open");
    expect(
      await Bun.file(
        join(path, "web/src/lib/components/app-sidebar.svelte"),
      ).text(),
    ).toContain('collapsible="icon"');
    expect(
      await Bun.file(join(path, "web/src/routes/+layout.svelte")).text(),
    ).toContain("<Sidebar.Provider>");
    expect(await Bun.file(join(path, "web/src/routes/examples")).exists()).toBe(
      false,
    );
    expect(await Bun.file(join(path, "src/routes/realtime.ts")).exists()).toBe(
      false,
    );
    const theme = await Bun.file(
      join(path, "web/src/lib/components/theme-toggle.svelte"),
    ).text();
    expect(theme).toContain(
      "'Nova', 'Vega', 'Maia', 'Lyra', 'Mira', 'Luma', 'Sera', 'Rhea'",
    );
    expect(theme).toContain("<Sheet.Content");
    expect(theme).toContain(
      '<Command.Input placeholder="Type to find a style…"',
    );
    expect(theme).toContain("function reset()");
    const sidebar = await Bun.file(
      join(path, "web/src/lib/components/app-sidebar.svelte"),
    ).text();
    expect(sidebar).toContain("group-data-[collapsible=icon]:hidden");
    const manifest = await Bun.file(join(path, "package.json")).json();
    const env = await Bun.file(join(path, ".env.example")).text();
    const webManifest = await Bun.file(
      join(path, "web", "package.json"),
    ).json();
    expect(manifest.devDependencies.pg).toBeUndefined();
    expect(manifest.devDependencies.typescript).toBe("7.0.2");
    expect(env).toContain("/shop_development");
    expect(webManifest.scripts.dev).toBe("bun --bun vite");
    expect(
      await Bun.file(
        join(
          path,
          "web/src/lib/components/ui/sidebar/sidebar-menu-button.svelte",
        ),
      ).text(),
    ).toContain("data-[active=true]:bg-sidebar-accent");
  });

  test("creates an API-only application without a web workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "bunway-"));
    const path = join(root, "api");
    await createProject(path, { install: false, apiOnly: true });
    expect(await Bun.file(join(path, ".bunway-api-only")).exists()).toBe(true);
    expect(await Bun.file(join(path, "web/package.json")).exists()).toBe(false);
    const manifest = await Bun.file(join(path, "package.json")).json();
    expect(manifest.workspaces).toBeUndefined();
    expect(manifest.scripts.build).toContain("bun build src/app.ts");
  });

  test("creates SQLite and MySQL primary applications", async () => {
    for (const adapter of ["sqlite", "mysql"] as const) {
      const root = await mkdtemp(join(tmpdir(), `bunway-${adapter}-`));
      const path = join(root, "app");
      await createProject(path, { install: false, database: adapter });
      const index = await Bun.file(join(path, "src/db/index.ts")).text();
      expect(index).toContain(
        adapter === "sqlite" ? "sqliteDrizzle" : "mysqlDrizzle",
      );
      const manifest = await Bun.file(join(path, "package.json")).json();
      expect(manifest.devDependencies.pg).toBeUndefined();
      if (adapter === "mysql")
        expect(manifest.dependencies.mysql2).toBe("latest");
    }
  });

  test("generates and applies SQLite migrations with bun:sqlite", async () => {
    const root = await mkdtemp(join(tmpdir(), "bunway-sqlite-migrate-"));
    const path = join(root, "app");
    await createProject(path, { database: "sqlite", apiOnly: true });
    await generateResource("Product", ["name:string"], path);
    await migrateDatabases(undefined, false, path);
    const { Database } = await import("bun:sqlite");
    const database = new Database(join(path, "storage/development.sqlite"));
    const tables = database
      .query("select name from sqlite_master where type = 'table'")
      .all() as { name: string }[];
    database.close();
    expect(tables.map(({ name }) => name)).toContain("products");
    expect(tables.map(({ name }) => name)).toContain("storage_blobs");
  }, 30_000);

  test("adds named mixed databases and generates adapter-aware schemas", async () => {
    const path = await app();
    await addDatabase("analytics", "sqlite", path);
    await addDatabase("legacy", "mysql", path);
    await generateModel("Event", ["name:string", "payload:json"], path, {
      database: "analytics",
    });
    await generateModel("LegacyCustomer", ["name:string"], path, {
      database: "legacy",
    });
    const config = await databaseConfig(path);
    expect(Object.keys(config)).toEqual(["primary", "analytics", "legacy"]);
    const analyticsSchema = await Bun.file(
      join(path, "src/db/analytics/schema/events.ts"),
    ).text();
    expect(analyticsSchema).toContain("sqliteTable");
    expect(analyticsSchema).toContain("Bun.randomUUIDv7()");
    const legacySchema = await Bun.file(
      join(path, "src/db/legacy/schema/legacy-customers.ts"),
    ).text();
    expect(legacySchema).toContain("mysqlTable");
    expect(legacySchema).toContain("Bun.randomUUIDv7()");
    const index = await Bun.file(join(path, "src/db/index.ts")).text();
    expect(index).toContain("export const analytics");
    expect(index).toContain("export const legacy");
  });

  test("adds a Bun.SQL PostgreSQL database without a client package", async () => {
    const root = await mkdtemp(join(tmpdir(), "bunway-sqlite-postgres-"));
    const path = join(root, "app");
    await createProject(path, { install: false, database: "sqlite" });

    await addDatabase("queue", "postgres", path);

    const manifest = await Bun.file(join(path, "package.json")).json();
    expect(manifest.devDependencies.pg).toBeUndefined();
  });

  test("generates Better Auth directly with database, Elysia, and Svelte integration", async () => {
    const path = await app();
    await generateAuth(
      {
        password: true,
        magicLink: true,
        passkeys: true,
        oauth: ["google", "github"],
        mfa: ["totp", "backup-codes", "email-otp", "trusted-devices"],
        bearer: true,
        apiKey: true,
      },
      path,
    );
    const auth = await Bun.file(join(path, "src/auth/index.ts")).text();
    const schema = await Bun.file(join(path, "src/db/schema/auth.ts")).text();
    const appSource = await Bun.file(join(path, "src/app.ts")).text();
    const env = await Bun.file(join(path, ".env.example")).text();
    expect(auth).toContain("betterAuth({");
    expect(auth).toContain("drizzleAdapter(db, { provider: 'pg', schema })");
    expect(auth).toContain("magicLink({");
    expect(auth).toContain("twoFactor({");
    expect(auth).toContain("passkey({");
    expect(schema).toContain("export const twoFactor");
    expect(schema).toContain("export const passkey");
    expect(schema).toContain("export const apikey");
    expect(appSource).toContain(".use(authPlugin)");
    expect(appSource).toContain("credentials: true");
    expect(env).toContain("GOOGLE_CLIENT_ID=");
    expect(
      await Bun.file(join(path, "web/src/routes/login/+page.svelte")).exists(),
    ).toBe(true);
    expect(
      await Bun.file(
        join(path, "web/src/routes/account/security/+page.svelte"),
      ).exists(),
    ).toBe(true);
    const sidebar = await Bun.file(
      join(path, "web/src/lib/components/app-sidebar.svelte"),
    ).text();
    const manifest = await Bun.file(join(path, "package.json")).json();
    const webManifest = await Bun.file(join(path, "web/package.json")).json();
    expect(manifest.dependencies["better-auth"]).toBe("^1.7.1");
    expect(manifest.dependencies["@better-auth/drizzle-adapter"]).toBe(
      "^1.7.1",
    );
    expect(webManifest.dependencies["better-auth"]).toBe("^1.7.1");
    expect(sidebar).not.toContain("auth-client");
    expect(sidebar).toContain('href="/account"');
  });

  test("validates auth feature combinations", () => {
    expect(() =>
      normalizeAuthOptions({ magicLink: true, mfa: ["totp"] }),
    ).toThrow("add --password");
    expect(() =>
      normalizeAuthOptions({ password: true, mfa: ["backup-codes"] }),
    ).toThrow("requires totp");
  });

  test("generates portable Audit schemas and selects a named database", async () => {
    for (const adapter of ["postgres", "mysql", "sqlite"] as const) {
      const root = await mkdtemp(join(tmpdir(), `bunway-audit-${adapter}-`));
      const path = join(root, "app");
      await createProject(path, { install: false, database: adapter });
      await generateAudit({}, path);
      const schema = await Bun.file(
        join(path, "src/db/schema/audit-logs.ts"),
      ).text();
      expect(schema).toContain(
        adapter === "postgres"
          ? "pgTable"
          : adapter === "mysql"
            ? "mysqlTable"
            : "sqliteTable",
      );
      expect(schema).toContain(
        adapter === "postgres"
          ? "jsonb('metadata')"
          : adapter === "mysql"
            ? "json('metadata')"
            : "mode: 'json'",
      );
      expect(schema).toContain("audit_logs_subject_created_at_idx");
    }

    const path = await app();
    await addDatabase("audit", "sqlite", path);
    await generateAudit({ database: "audit" }, path);
    expect(
      await Bun.file(join(path, "src/db/audit/schema/audit-logs.ts")).text(),
    ).toContain("sqliteTable");
    expect(await Bun.file(join(path, "src/audit/index.ts")).text()).toContain(
      "import { audit as auditDatabase } from '../db'",
    );
    expect(await Bun.file(join(path, "src/audit/index.ts")).text()).toContain(
      "context: { db?: Pick<typeof auditDatabase, 'insert'> }",
    );
  });

  test("recursively sanitizes audit metadata without mutation", async () => {
    const path = await app();
    await generateAudit({}, path);
    const module = await import(join(path, "src/audit/sanitize.ts"));
    const input = {
      Password: "one",
      safe: "visible",
      credentials: {
        access_token: "two",
        profile: { email: "demo@example.com" },
      },
      entries: [{ CLIENT_SECRET: "three", label: "kept" }],
      auth: { code: "123456" },
      postal: { code: "90210" },
    };
    const result = module.sanitizeAuditMetadata(input);
    expect(result).toEqual({
      Password: "[REDACTED]",
      safe: "visible",
      credentials: {
        access_token: "[REDACTED]",
        profile: { email: "demo@example.com" },
      },
      entries: [{ CLIENT_SECRET: "[REDACTED]", label: "kept" }],
      auth: { code: "[REDACTED]" },
      postal: { code: "90210" },
    });
    expect(input.Password).toBe("one");
    expect(module.sanitizeAuditMetadata(null)).toBeNull();
    expect(module.sanitizeAuditMetadata("safe")).toBe("safe");
  });

  test("generates typed mailers, SMS definitions, and one messaging setup", async () => {
    const path = await app();
    await generateMailer("Order", ["confirmation", "shipped"], path);
    await generateSms("Order", ["shipped", "delayed"], path);
    const setup = await Bun.file(join(path, "src/messaging/index.ts")).text();
    const mailer = await Bun.file(join(path, "src/mailers/order.ts")).text();
    const sms = await Bun.file(join(path, "src/sms/order.ts")).text();
    const jobs = await Bun.file(join(path, "src/jobs/index.ts")).text();
    const env = await Bun.file(join(path, ".env.example")).text();
    expect(setup).toContain("createMail");
    expect(setup).toContain("audit.record");
    expect(
      await Bun.file(join(path, "src/db/schema/audit-logs.ts")).exists(),
    ).toBe(true);
    expect(setup).toContain("context.attempt >= context.maxAttempts");
    expect(mailer).toContain("orderMailer = mailer");
    expect(mailer).toContain("confirmation:");
    expect(sms).toContain("orderSms = sms.define");
    expect(sms).toContain("delayed:");
    expect(jobs).toContain("mailDeliveryJob, smsDeliveryJob");
    expect(env).toContain("MAIL_DRIVER=");
    expect(env).toContain("TWILIO_AUTH_TOKEN=");
  });

  test("generates and registers a model", async () => {
    const path = await app();
    await generateModel("User", ["name:string", "email:string:unique"], path);
    expect(
      await Bun.file(join(path, "src/db/schema/users.ts")).text(),
    ).toContain("email: text('email').notNull().unique()");
    expect(
      await Bun.file(join(path, "src/db/schema/index.ts")).text(),
    ).toContain("export { users } from './users'");
    const schema = await Bun.file(join(path, "src/db/schema/users.ts")).text();
    expect(schema).toContain(
      "createdAt: timestamp('createdAt', { mode: 'string' }).notNull().defaultNow()",
    );
    expect(schema).toContain(
      "updatedAt: timestamp('updatedAt', { mode: 'string' }).notNull().defaultNow()",
    );
  });

  test("can omit generated timestamps", async () => {
    const path = await app();
    await generateModel("AuditLog", ["message:string"], path, {
      timestamps: false,
    });
    const schema = await Bun.file(
      join(path, "src/db/schema/audit-logs.ts"),
    ).text();
    expect(schema).not.toContain("createdAt");
    expect(schema).not.toContain("updatedAt");
  });

  test("generates a compact resource and job", async () => {
    const path = await app();
    await generateResource("Product", ["name:string", "price:decimal"], path);
    await generateJob("ImportProducts", path);
    expect(
      await Bun.file(join(path, "src/routes/products.ts")).text(),
    ).toContain("prefix: '/products'");
    expect(
      await Bun.file(join(path, "src/routes/products.ts")).text(),
    ).toContain("updatedAt: new Date().toISOString()");
    expect(await Bun.file(join(path, "tests/products.test.ts")).exists()).toBe(
      true,
    );
    expect(await Bun.file(join(path, "src/jobs/index.ts")).text()).toContain(
      "importProducts",
    );
  });

  test("generates typed SSE status and WebSocket chat channels", async () => {
    const path = await app();
    await generateRealtime("status", "Order", path);
    await generateRealtime("chat", "Room", path);
    const status = await Bun.file(
      join(path, "src/realtime/order-status.ts"),
    ).text();
    const chat = await Bun.file(join(path, "src/realtime/room-chat.ts")).text();
    expect(status).toContain("channel('orders/:id'");
    expect(status).toContain("SSE: server-to-client updates");
    expect(status).toContain("status: t.String()");
    expect(chat).toContain("WebSocket: bidirectional updates");
    expect(chat).toContain("text: t.String()");
    expect(await Bun.file(join(path, "src/realtime/index.ts")).exists()).toBe(
      false,
    );
  });

  test("generates Drizzle-backed attachment fields without resource columns", async () => {
    const path = await app();
    await generateResource(
      "Product",
      [
        "name:string",
        "image:image:optional",
        "manual:file:optional",
        "photos:files:optional",
      ],
      path,
      { ui: true },
    );
    const schema = await Bun.file(
      join(path, "src/db/schema/products.ts"),
    ).text();
    const model = await Bun.file(join(path, "src/models/products.ts")).text();
    const route = await Bun.file(join(path, "src/routes/products.ts")).text();
    const page = await Bun.file(
      join(path, "web/src/routes/products/+page.svelte"),
    ).text();
    expect(schema).not.toContain("image:");
    expect(schema).not.toContain("manual:");
    expect(model).toContain("attachmentHydrator<");
    expect(model).toContain("Product,");
    expect(model).toContain("recordType: 'products'");
    expect(route).toContain("image: t.Optional(t.File())");
    expect(route).toContain("!body.image.type.startsWith('image/')");
    expect(route).toContain("photos: t.Optional(t.Files())");
    expect(route).toContain("hydrated.image.attach(uploadedFile(image))");
    expect(route).toContain("'/:id/image'");
    expect(route).toContain("imageAttachment: await hydrated.image.item()");
    expect(page).toContain('accept="image/*"');
    expect(page).toContain("AttachmentBadge");
    expect(page).toContain("ResizableHead");
    expect(
      await Bun.file(join(path, "src/db/schema/storage.ts")).exists(),
    ).toBe(true);
  });

  test("generates opt-in Drizzle-native soft deletion", async () => {
    const path = await app();
    await generateResource("Product", ["name:string"], path, {
      softDelete: true,
    });
    const schema = await Bun.file(
      join(path, "src/db/schema/products.ts"),
    ).text();
    const route = await Bun.file(join(path, "src/routes/products.ts")).text();
    expect(schema).toContain(
      "deletedAt: timestamp('deletedAt', { mode: 'string' })",
    );
    expect(schema).toContain(
      "index('products_deletedAt_idx').on(table.deletedAt)",
    );
    expect(route).toContain("isNull(products.deletedAt)");
    expect(route).toContain("set({ deletedAt: new Date().toISOString() })");
    expect(route).toContain("'/:id/restore'");
  });

  test("generates a Svelte CRUD page for a scaffold", async () => {
    const path = await app();
    await generateResource(
      "Product",
      ["name:string", "price:decimal", "active:boolean"],
      path,
      { ui: true },
    );
    const page = await Bun.file(
      join(path, "web/src/routes/products/+page.svelte"),
    ).text();
    expect(page).toContain("api.products.post(form)");
    expect(page).toContain("api.products({ id }).delete()");
    expect(page).toContain("New Product");
    expect(page).toContain("RowActions");
    expect(page).toContain("toggleSort");
    expect(page).toContain("function scheduleFilter()");
    expect(page).toContain("toggleAll");
    expect(page).toContain("Show columns");
    expect(page).toContain("Filter products…");
    expect(page).toContain("w-full min-w-0");
    expect(page).toContain("<Switch bind:checked={form.active}");
    expect(page).toContain("{total === 1 ? 'record' : 'records'}");
    expect(page).toContain('<Select.Item value="all">All</Select.Item>');
    expect(page).toContain('<Table.Root class="w-max min-w-full table-fixed">');
    expect(page).toContain("bg-card text-card-foreground");
    expect(page).toContain("<TruncatedCell value={record.name}");
    expect(page).not.toContain("><");
    expect(
      Math.max(...page.split("\n").map((line) => line.length)),
    ).toBeLessThanOrEqual(100);
    expect(
      await Bun.file(join(path, "web/src/lib/resources.ts")).text(),
    ).toContain(
      "{ label: 'Products', href: '/products', icon: 'shopping-bag' }",
    );
    const route = await Bun.file(join(path, "src/routes/products.ts")).text();
    expect(route).toContain("db.select({ total: count() })");
    expect(route).toContain("requested === 'all'");
    expect(route).toContain("sortColumns");
    expect(route).toContain("ilike(products.name");
    expect(
      await Bun.file(
        join(path, "web/src/routes/products/[id]/+page.svelte"),
      ).exists(),
    ).toBe(true);
    const details = await Bun.file(
      join(path, "web/src/routes/products/[id]/+page.svelte"),
    ).text();
    expect(details).toContain("DetailEditDialog");
    expect(details).toContain('endpoint="/products"');
    expect(details).toContain("{ key: 'name', label: 'Name', kind: 'text' }");
    expect(details).not.toContain("?edit=");
    expect(details).toContain(
      "border bg-card p-6 text-card-foreground shadow-sm",
    );
    expect(details).toContain("border-b border-border");
    expect(details).toContain("text-muted-foreground");
    expect(details).not.toContain("bg-white");
    expect(page).not.toContain(
      "new URLSearchParams(location.search).get('edit')",
    );
    const rowActions = await Bun.file(
      join(path, "web/src/lib/components/row-actions.svelte"),
    ).text();
    expect(rowActions).toContain("Are you sure? This action cannot be undone.");
    expect(rowActions).toContain("confirmDelete");
  });

  test("uses correct plural labels and semantic resource icons", async () => {
    const path = await app();
    await generateResource("Category", ["name:string"], path, { ui: true });
    const page = await Bun.file(
      join(path, "web/src/routes/categories/+page.svelte"),
    ).text();
    const details = await Bun.file(
      join(path, "web/src/routes/categories/[id]/+page.svelte"),
    ).text();
    const resources = await Bun.file(
      join(path, "web/src/lib/resources.ts"),
    ).text();
    expect(page).toContain("<title>Categories</title>");
    expect(page).toContain(">Categories</h1>");
    expect(page).not.toContain("Categorys");
    expect(details).toContain("← Back to Categories");
    expect(resources).toContain(
      "label: 'Categories', href: '/categories', icon: 'folder'",
    );
  });

  test("makes a position column sortable and rows reorderable", async () => {
    const path = await app();
    await generateResource("Task", ["name:string", "position:integer"], path, {
      ui: true,
    });
    const page = await Bun.file(
      join(path, "web/src/routes/tasks/+page.svelte"),
    ).text();
    expect(page).toContain("let sortField = $state('position')");
    expect(page).toContain("draggable={sortField === 'position'");
    expect(page).toContain("async function dropRow");
    expect(page).toContain(
      "const positions = next.map((record) => record.position)",
    );
  });

  test("generates shadcn date, datetime, time, float, and boolean controls", async () => {
    const path = await app();
    await generateResource(
      "Event",
      [
        "enabled:boolean",
        "score:float",
        "startsOn:date",
        "startsAt:datetime",
        "opensAt:time",
        "recordedAt:timestamp",
      ],
      path,
      { ui: true },
    );
    const schema = await Bun.file(join(path, "src/db/schema/events.ts")).text();
    const page = await Bun.file(
      join(path, "web/src/routes/events/+page.svelte"),
    ).text();
    expect(schema).toContain("startsOn: date('startsOn')");
    expect(schema).toContain(
      "startsAt: timestamp('startsAt', { mode: 'string' })",
    );
    expect(page).toContain('<DateField label="startsOn" type="date"');
    expect(page).toContain('<DateField label="startsAt" type="datetime"');
    expect(page).toContain('<DateField label="opensAt" type="time"');
    expect(page).toContain('<DateField label="recordedAt" type="datetime"');
    const dateField = await Bun.file(
      join(path, "web/src/lib/components/date-field.svelte"),
    ).text();
    expect(dateField).toContain(
      "import { Input } from '$lib/components/ui/input/index.js'",
    );
    expect(page).toContain("formatDisplayDate(record.startsOn, false)");
    expect(page).toContain("formatDisplayDate(record.startsAt, true)");
    const details = await Bun.file(
      join(path, "web/src/routes/events/[id]/+page.svelte"),
    ).text();
    expect(details).toContain("formatDisplayDate(record.startsAt, true)");
  });

  test("generates neutral styling and persisted date-time preferences", async () => {
    const path = await app();
    const settings = await Bun.file(
      join(path, "web/src/lib/components/theme-toggle.svelte"),
    ).text();
    const html = await Bun.file(join(path, "web/src/app.html")).text();
    expect(settings).not.toContain("Base color");
    expect(settings).toContain("Date and time");
    expect(settings).toContain("Timezone");
    expect(settings).toContain("Date format");
    expect(settings).toContain("Time format");
    expect(settings).toContain("saveDateTimePreferences");
    expect(html).toContain("dataset.uiBase = 'neutral'");
    expect(
      await Bun.file(join(path, "web/src/lib/date-time.svelte.ts")).exists(),
    ).toBe(true);
  });

  test("can omit show from both API and UI", async () => {
    const path = await app();
    await generateResource("Product", ["name:string"], path, {
      ui: true,
      actions: ["index", "create", "update", "destroy"],
    });
    expect(
      await Bun.file(join(path, "src/routes/products.ts")).text(),
    ).not.toContain(".get('/:id'");
    expect(
      await Bun.file(
        join(path, "web/src/routes/products/[id]/+page.svelte"),
      ).exists(),
    ).toBe(false);
  });

  test("generates indexed references and Drizzle relation metadata", async () => {
    const path = await app();
    await generateModel("Category", ["name:string"], path);
    await generateModel(
      "Product",
      ["name:string", "category:references"],
      path,
    );
    const schema = await Bun.file(
      join(path, "src/db/schema/products.ts"),
    ).text();
    expect(schema).toContain("categoryId: uuid('categoryId')");
    expect(schema).toContain(".references(() => categories.id)");
    expect(schema).toContain(
      "index('products_categoryId_idx').on(table.categoryId)",
    );
    expect(schema).toContain("category: one(categories");
  });

  test("scaffolds a human relationship picker with inline creation", async () => {
    const path = await app();
    await generateResource("Category", ["name:string"], path);
    await generateResource(
      "Product",
      ["name:string", "category:references"],
      path,
      { ui: true },
    );
    const page = await Bun.file(
      join(path, "web/src/routes/products/+page.svelte"),
    ).text();
    expect(page).toContain("RelationshipCombobox");
    expect(page).toContain("items={categoryItems}");
    expect(page).toContain("createCategory");
    expect(page).toContain("api.categories.post({ name: value })");
    expect(page).not.toContain('type="number" bind:value={form.categoryId}');
  });

  test("generates all Drizzle relationship cardinalities and scaffold controls", async () => {
    const path = await app();
    for (const name of ["Author", "Profile", "Comment", "Tag"])
      await generateResource(name, ["name:string"], path);
    await generateResource(
      "Post",
      [
        "title:string",
        "author:belongs_to",
        "profile:has_one:optional",
        "comments:has_many",
        "tags:many_to_many",
      ],
      path,
      { ui: true },
    );
    const schema = await Bun.file(join(path, "src/db/schema/posts.ts")).text();
    const hasMany = await Bun.file(
      join(path, "src/db/schema/posts-to-comments.ts"),
    ).text();
    const manyToMany = await Bun.file(
      join(path, "src/db/schema/posts-to-tags.ts"),
    ).text();
    const route = await Bun.file(join(path, "src/routes/posts.ts")).text();
    const page = await Bun.file(
      join(path, "web/src/routes/posts/+page.svelte"),
    ).text();
    const details = await Bun.file(
      join(path, "web/src/routes/posts/[id]/+page.svelte"),
    ).text();
    expect(schema).toContain("authorId: uuid('authorId')");
    expect(schema).toContain(".references(() => authors.id)");
    expect(schema).toContain("profileId: uuid('profileId')");
    expect(schema).toContain(".references(() => profiles.id)");
    expect(schema).toContain("comments: many(postsToComments)");
    expect(schema).toContain("tags: many(postsToTags)");
    expect(hasMany).toContain(
      ".references(() => comments.id, { onDelete: 'cascade' })",
    );
    expect(hasMany).toContain(".unique()");
    expect(manyToMany).toContain(
      ".references(() => tags.id, { onDelete: 'cascade' })",
    );
    expect(manyToMany).toContain(
      "createdAt: timestamp('createdAt', { mode: 'string' })",
    );
    expect(manyToMany).not.toContain(".unique()");
    expect(route).toContain("'/:id/tags'");
    expect(route).toContain(".put(");
    expect(route).toContain("withAssociations");
    expect(route).toContain("commentsIds: commentsRows");
    expect(route).toContain("tagsIds: tagsRows.filter");
    expect(page).toContain("RelationshipMultiCombobox");
    expect(page).toContain("bind:values={tagsSelected}");
    expect(page).toContain("href={`/authors/${record.authorId}`}");
    expect(page).toContain('class="max-w-0 px-3 py-2 text-left"');
    expect(page).toContain("{record.commentsIds.length}");
    expect(page).toContain("{record.tagsIds.length}");
    expect(page).toContain("rounded-full bg-muted");
    expect(details).toContain("href={`/authors/${record.authorId}`}");
    expect(details).toContain("{#each record.commentsIds as relatedId}");
    expect(details).toContain("href={`/comments/${relatedId}`}");
    expect(details).toContain("{#each record.tagsIds as relatedId}");
    expect(details).toContain("href={`/tags/${relatedId}`}");
  });

  test("generates an explicit polymorphic many-to-many relationship", async () => {
    const path = await app();
    await generateResource("Tag", ["name:string"], path);
    await generateResource(
      "Product",
      ["name:string", "tags:many_to_many:as=taggable:through=taggings"],
      path,
      { ui: true },
    );
    const schema = await Bun.file(
      join(path, "src/db/schema/products.ts"),
    ).text();
    const joinSchema = await Bun.file(
      join(path, "src/db/schema/taggings.ts"),
    ).text();
    const schemaIndex = await Bun.file(
      join(path, "src/db/schema/index.ts"),
    ).text();
    const route = await Bun.file(join(path, "src/routes/products.ts")).text();
    const page = await Bun.file(
      join(path, "web/src/routes/products/+page.svelte"),
    ).text();
    const details = await Bun.file(
      join(path, "web/src/routes/products/[id]/+page.svelte"),
    ).text();
    expect(schema).toContain("tags: many(taggings)");
    expect(joinSchema).toContain(
      "taggableType: text('taggableType').notNull()",
    );
    expect(joinSchema).toContain("taggableId: uuid('taggableId').notNull()");
    expect(joinSchema).toContain(
      "table.tagId, table.taggableType, table.taggableId",
    );
    expect(joinSchema).not.toContain("references(() => products.id");
    expect(schemaIndex).toContain("export { taggings } from './taggings'");
    expect(route).toContain("eq(taggings.taggableType, 'Product')");
    expect(route).toContain("eq(taggings.taggableType, 'Product'),");
    expect(route).toContain("inArray(");
    expect(route).toContain("taggings.taggableId,");
    expect(route).toContain("taggableType: 'Product'");
    expect(route).toContain("'/:id/tags'");
    expect(page).toContain("bind:values={tagsSelected}");
    expect(page).toContain("{record.tagsIds.length}");
    expect(details).toContain("{#each record.tagsIds as relatedId}");
    expect(details).toContain("href={`/tags/${relatedId}`}");
  });

  test("generates the showcase polymorphic relationship for MySQL and SQLite", async () => {
    for (const adapter of ["mysql", "sqlite"] as const) {
      const root = await mkdtemp(join(tmpdir(), `bunway-showcase-${adapter}-`));
      const path = join(root, "app");
      await createProject(path, { install: false, database: adapter });
      await generateResource("Tag", ["name:string"], path);
      await generateResource(
        "Post",
        ["title:string", "tags:many_to_many:as=taggable:through=post_taggings"],
        path,
        { ui: true },
      );
      const joinSchema = await Bun.file(
        join(path, "src/db/schema/post-taggings.ts"),
      ).text();
      const schemaIndex = await Bun.file(
        join(path, "src/db/schema/index.ts"),
      ).text();
      expect(joinSchema).toContain(
        adapter === "mysql" ? "mysqlTable" : "sqliteTable",
      );
      expect(joinSchema).toContain("taggableType");
      expect(schemaIndex).toContain(
        "export { postTaggings } from './post-taggings'",
      );
    }
  });

  test("defaults IDs to UUID and inherits target ID types for references", async () => {
    const path = await app();
    await generateModel("Account", ["name:string"], path, {
      idType: "integer",
    });
    await generateResource(
      "Session",
      ["account:references", "token:uuid"],
      path,
    );
    const account = await Bun.file(
      join(path, "src/db/schema/accounts.ts"),
    ).text();
    const session = await Bun.file(
      join(path, "src/db/schema/sessions.ts"),
    ).text();
    const route = await Bun.file(join(path, "src/routes/sessions.ts")).text();
    expect(account).toContain("id: serial('id').primaryKey()");
    expect(session).toContain(".$defaultFn(() => Bun.randomUUIDv7())");
    expect(session).toContain("accountId: integer('accountId')");
    expect(route).toContain("eq(sessions.id, params.id)");
    expect(route).toContain("accountId: t.Numeric()");
  });

  test("generates and inherits compact base64url UUIDv7 IDs", async () => {
    const path = await app();
    await generateModel("Account", ["name:string"], path, {
      idEncoding: "base64url",
    });
    await generateResource("Session", ["account:references"], path, {
      idEncoding: "base64url",
    });
    const account = await Bun.file(
      join(path, "src/db/schema/accounts.ts"),
    ).text();
    const session = await Bun.file(
      join(path, "src/db/schema/sessions.ts"),
    ).text();
    const route = await Bun.file(join(path, "src/routes/sessions.ts")).text();
    expect(account).toContain("varchar('id', { length: 22 })");
    expect(account).toContain("Bun.randomUUIDv7('base64url')");
    expect(session).toContain(
      "accountId: varchar('accountId', { length: 22 })",
    );
    expect(route).toContain("accountId: t.String()");
  });

  test("generates PostgreSQL scalar, enum, and array field builders", async () => {
    const path = await app();
    await generateModel(
      "Metric",
      [
        "short:smallint",
        "large:bigint",
        "ratio:real",
        "score:float",
        "amount:numeric",
        "code:varchar",
        "initial:char",
        "state:enum=draft,published",
        "labels:string[]",
        "day:date",
        "clock:time",
        "occurredAt:timestamptz",
        "duration:interval",
        "metadata:jsonb",
        "address:inet",
        "network:cidr",
        "hardware:macaddr8",
      ],
      path,
      { idType: "bigint" },
    );
    const schema = await Bun.file(
      join(path, "src/db/schema/metrics.ts"),
    ).text();
    expect(schema).toContain(
      "id: bigserial('id', { mode: 'number' }).primaryKey()",
    );
    expect(schema).toContain(
      "state: text('state', { enum: ['draft', 'published'] })",
    );
    expect(schema).toContain("labels: text('labels').array().notNull()");
    expect(schema).toContain("withTimezone: true");
    expect(schema).toContain("hardware: macaddr8('hardware')");
  });
});
