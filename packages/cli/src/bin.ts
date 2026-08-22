#!/usr/bin/env bun
import { join } from "node:path";
import { createProject } from "./project";
import {
  generateJob,
  generateModel,
  generateRealtime,
  generateResource,
  type RealtimeRecipe,
} from "./generate";
import { CliError } from "./utils";
import { developmentCommands, developmentNotice } from "./dev";
import { startConsole } from "./console";
import type { IdEncoding, IdType } from "./fields";
import { addDatabase, listDatabases, migrateDatabases } from "./databases";
import {
  authMfaMethods,
  authProviders,
  generateAuth,
  type AuthMfaMethod,
  type AuthProvider,
} from "./auth";
import { generateAudit } from "./audit";
import { generateMailer, generateSms } from "./messaging";
import { cliVersion } from "./version";

const [command, ...args] = Bun.argv.slice(2);

async function main() {
  if (!command || ["help", "--help", "-h"].includes(command)) return help();
  if (["version", "--version", "-v"].includes(command))
    return console.log(await cliVersion());
  if (command === "new")
    return createProject(args[0], {
      install: !args.includes("--no-install"),
      apiOnly: args.includes("--api-only"),
      database: args
        .find((value) => value.startsWith("--database="))
        ?.slice(11) as
        "postgres" | "mysql" | "sqlite" | undefined,
    });
  if (command === "dev") return dev();
  if (command === "routes") return routes();
  if (command === "db:migrate")
    return migrateDatabases(
      args.find((value) => value.startsWith("--database="))?.slice(11),
      args.includes("--all"),
    );
  if (command === "db:add")
    return addDatabase(
      args[0],
      args.find((value) => value.startsWith("--adapter="))?.slice(10) as
        "postgres" | "mysql" | "sqlite" | undefined,
      process.cwd(),
    );
  if (command === "db:list") return listDatabases();
  if (command === "worker") return worker();
  if (command === "console" || command === "c") return startConsole();
  if (command === "generate" || command === "g") {
    const [kind, name, ...fields] = args;
    if (kind === "auth") {
      const flags = args.slice(1);
      const hasMethodFlag = flags.some(
        (value) =>
          [
            "--password",
            "--magic-link",
            "--passkeys",
            "--bearer",
            "--api-key",
          ].includes(value) ||
          value.startsWith("--oauth=") ||
          value.startsWith("--mfa="),
      );
      let password = flags.includes("--password");
      let magicLink = flags.includes("--magic-link");
      let passkeys = flags.includes("--passkeys");
      let oauth = (flags
        .find((value) => value.startsWith("--oauth="))
        ?.slice(8)
        .split(",") ?? []) as AuthProvider[];
      let mfa = (flags
        .find((value) => value.startsWith("--mfa="))
        ?.slice(6)
        .split(",") ?? []) as AuthMfaMethod[];
      if (!hasMethodFlag) {
        console.log(
          "Authentication methods:\n  1. Email + password (recommended)\n  2. Magic link\n  3. Passkeys\n  4. OAuth / Social login",
        );
        const methods = (prompt("Choose comma-separated numbers [1]: ") || "1")
          .split(",")
          .map((value) => value.trim());
        password = methods.includes("1");
        magicLink = methods.includes("2");
        passkeys = methods.includes("3");
        if (methods.includes("4")) {
          console.log(`OAuth providers: ${authProviders.join(", ")}`);
          oauth = (prompt("Choose comma-separated providers: ") ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean) as AuthProvider[];
        }
        if (password) {
          console.log(
            `Multi-factor authentication (optional): ${authMfaMethods.join(", ")}`,
          );
          mfa = (prompt("Choose comma-separated MFA methods: ") ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean) as AuthMfaMethod[];
        }
        if (
          (prompt("Generate authentication? [Y/n] ") || "y")
            .toLowerCase()
            .startsWith("n")
        )
          return;
      }
      const database =
        flags.find((value) => value.startsWith("--database="))?.slice(11) ??
        "primary";
      const apiOnly = await Bun.file(
        join(process.cwd(), ".bunway-api-only"),
      ).exists();
      return generateAuth({
        password,
        magicLink,
        passkeys,
        oauth,
        mfa,
        bearer: flags.includes("--bearer"),
        apiKey: flags.includes("--api-key"),
        database,
        apiOnly,
      });
    }
    if (kind === "audit") {
      const flags = args.slice(1);
      const configuredIdType =
        flags.find((value) => value.startsWith("--id-type="))?.slice(10) ??
        Bun.env.BUNWAY_ID_TYPE ??
        "uuid";
      if (!["uuid", "integer", "bigint"].includes(configuredIdType))
        throw new CliError("ID type must be uuid, integer, or bigint");
      const configuredIdEncoding =
        flags.find((value) => value.startsWith("--id-encoding="))?.slice(14) ??
        Bun.env.BUNWAY_ID_ENCODING;
      if (
        configuredIdEncoding &&
        !["standard", "base64url"].includes(configuredIdEncoding)
      )
        throw new CliError("ID encoding must be standard or base64url");
      return generateAudit({
        database:
          flags.find((value) => value.startsWith("--database="))?.slice(11) ??
          "primary",
        idType: configuredIdType as IdType,
        idEncoding: configuredIdEncoding as IdEncoding | undefined,
      });
    }
    if (kind === "mailer")
      return generateMailer(
        name!,
        fields.filter((value) => !value.startsWith("--")),
      );
    if (kind === "sms")
      return generateSms(
        name!,
        fields.filter((value) => !value.startsWith("--")),
      );
    const only = fields
      .find((field) => field.startsWith("--only="))
      ?.slice(7)
      .split(",");
    const except =
      fields
        .find((field) => field.startsWith("--except="))
        ?.slice(9)
        .split(",") ?? [];
    const specs = fields.filter((field) => !field.startsWith("--"));
    const allActions = ["index", "show", "create", "update", "destroy"];
    const actions = (only ?? allActions).filter(
      (action) => !except.includes(action),
    );
    const softDelete = fields.includes("--soft-delete");
    const timestamps = !fields.includes("--no-timestamps");
    const configuredIdType =
      fields.find((field) => field.startsWith("--id-type="))?.slice(10) ??
      Bun.env.BUNWAY_ID_TYPE ??
      "uuid";
    if (!["uuid", "integer", "bigint"].includes(configuredIdType))
      throw new CliError("ID type must be uuid, integer, or bigint");
    const idType = configuredIdType as IdType;
    const configuredIdEncoding =
      fields.find((field) => field.startsWith("--id-encoding="))?.slice(14) ??
      Bun.env.BUNWAY_ID_ENCODING;
    if (
      configuredIdEncoding &&
      !["standard", "base64url"].includes(configuredIdEncoding)
    )
      throw new CliError("ID encoding must be standard or base64url");
    if (configuredIdEncoding && idType !== "uuid")
      throw new CliError(
        "--id-encoding and BUNWAY_ID_ENCODING may be used only with --id-type=uuid",
      );
    const idEncoding = (configuredIdEncoding ?? "standard") as IdEncoding;
    const database =
      fields.find((field) => field.startsWith("--database="))?.slice(11) ??
      "primary";
    const apiOnly = await Bun.file(
      join(process.cwd(), ".bunway-api-only"),
    ).exists();
    if (kind === "model")
      return generateModel(name!, specs, process.cwd(), {
        softDelete,
        timestamps,
        idType,
        idEncoding,
        database,
      });
    if (kind === "resource")
      return generateResource(name!, specs, process.cwd(), {
        ui: !apiOnly && fields.includes("--ui"),
        actions,
        softDelete,
        timestamps,
        idType,
        idEncoding,
        database,
      });
    if (kind === "scaffold")
      return generateResource(name!, specs, process.cwd(), {
        ui: !apiOnly,
        actions,
        softDelete,
        timestamps,
        idType,
        idEncoding,
        database,
      });
    if (kind === "job") return generateJob(name!);
    if (kind === "realtime") {
      const recipes = [
        "notifications",
        "status",
        "progress",
        "stream",
        "dashboard",
        "chat",
        "presence",
        "custom",
      ] as const;
      let recipe = name as RealtimeRecipe | undefined;
      let featureName = fields.find((field) => !field.startsWith("--")) ?? "";
      if (!recipe) {
        console.log(
          "What are you building?\n" +
            recipes
              .map((value, index) => `  ${index + 1}. ${value}`)
              .join("\n"),
        );
        const choice = Number(prompt("Choose 1-8: ")) - 1;
        recipe = recipes[choice];
      }
      if (!recipe || !recipes.includes(recipe))
        throw new CliError(
          `Realtime recipe must be one of: ${recipes.join(", ")}`,
        );
      const transportValue = fields
        .find((field) => field.startsWith("--transport="))
        ?.slice(12);
      if (
        transportValue &&
        transportValue !== "sse" &&
        transportValue !== "websocket"
      )
        throw new CliError("Realtime transport must be sse or websocket");
      return generateRealtime(
        recipe,
        featureName,
        process.cwd(),
        transportValue as "sse" | "websocket" | undefined,
      );
    }
    throw new CliError(
      "Generate model, resource, scaffold, job, realtime, auth, audit, mailer, or sms. Example: bunway g mailer Order confirmation",
    );
  }
  throw new CliError(`Unknown command "${command}". Run bunway help.`);
}

async function help() {
  console.log(`Bunway ${await cliVersion()}

  bunway --version | bunway -v
  bunway new <name> [--api-only] [--database=postgres|mysql|sqlite]
  bunway dev
  bunway g model <Name> [field:type...]
  bunway g resource <Name> [field:type...]
  bunway g scaffold <Name> [field:type...]
    relationships: references | belongs_to | has_one | has_many | many_to_many
    polymorphic: tags:many_to_many:as=taggable:through=taggings
    options: --database=<name>, --id-type=uuid|integer|bigint, --id-encoding=standard|base64url,
             --soft-delete, --no-timestamps, --only=..., --except=...
  bunway g job <Name>
  bunway g mailer <Name> [action...]
  bunway g sms <Name> [action...]
  bunway g audit [--database=<name>] [--id-type=uuid|integer|bigint] [--id-encoding=standard|base64url]
  bunway g auth [--password] [--magic-link] [--passkeys] [--oauth=google,github,microsoft,apple]
                [--mfa=totp,backup-codes,email-otp,trusted-devices] [--bearer] [--api-key] [--database=<name>]
  bunway g realtime <notifications|status|progress|stream|dashboard|chat|presence|custom> [Name] [--transport=sse|websocket]
  bunway db:add <name> --adapter=postgres|mysql|sqlite
  bunway db:list
  bunway db:migrate [--database=<name>|--all]
  bunway routes
  bunway worker
  bunway console | bunway c`);
}

async function dev() {
  console.log(developmentNotice());
  const apiOnly = await Bun.file(
    join(process.cwd(), ".bunway-api-only"),
  ).exists();
  const commands = apiOnly
    ? developmentCommands.slice(0, 1)
    : developmentCommands;
  const processes = commands.map((command) =>
    Bun.spawn([...command], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }),
  );
  const stop = () => processes.forEach((process) => process.kill());
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  const code = await Promise.race(processes.map((process) => process.exited));
  stop();
  process.exitCode = code;
}

async function routes() {
  const module = await import(join(process.cwd(), "src", "app.ts"));
  if (!module.app?.routes)
    throw new CliError("src/app.ts must export an Elysia instance named app");
  for (const route of module.app.routes)
    console.log(`${route.method.padEnd(8)} ${route.path}`);
}

async function worker() {
  await import(join(process.cwd(), "src", "jobs", "index.ts"));
  const { work } = await import("@bunway/core");
  await work({ queues: Bun.env.QUEUES?.split(",").filter(Boolean) });
}

try {
  await main();
} catch (error) {
  if (error instanceof CliError) console.error(`bunway: ${error.message}`);
  else if (Bun.env.DEBUG) console.error(error);
  else
    console.error(
      `bunway: ${error instanceof Error ? error.message : String(error)}`,
    );
  process.exitCode = 1;
}
