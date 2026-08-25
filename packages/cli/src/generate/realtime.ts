import { camel, kebab, CliError } from "../utils";
import { join } from "node:path";
import { ensureNew } from "../writing";

export type RealtimeRecipe =
  | "notifications"
  | "status"
  | "progress"
  | "stream"
  | "dashboard"
  | "chat"
  | "presence"
  | "custom";

export async function generateRealtime(
  recipe: RealtimeRecipe,
  raw = "",
  cwd = process.cwd(),
  transport?: "sse" | "websocket",
) {
  const bidirectional = recipe === "chat" || recipe === "presence";
  const selectedTransport = transport ?? (bidirectional ? "websocket" : "sse");
  const base = raw ? camel(raw) : recipe === "status" ? "" : camel(recipe);
  if (!base)
    throw new CliError(
      `A name is required for realtime ${recipe}. Example: bunway g realtime status Order`,
    );
  const suffixes: Partial<Record<RealtimeRecipe, string>> = {
    status: "Status",
    progress: "Progress",
    stream: "Stream",
    dashboard: "Dashboard",
    chat: "Chat",
    presence: "Presence",
  };
  const feature = raw ? `${base}${suffixes[recipe] ?? ""}` : base;
  const file = kebab(feature);
  const route =
    recipe === "notifications"
      ? "notifications"
      : recipe === "dashboard"
        ? "dashboard"
        : recipe === "progress"
          ? "jobs/:id"
          : `${kebab(base)}s/:id`;
  const events =
    recipe === "notifications"
      ? `notification: t.Object({ title: t.String(), message: t.String(), createdAt: t.String() })`
      : recipe === "status"
        ? `updated: t.Object({ status: t.String() })`
        : recipe === "progress"
          ? `progress: t.Object({ status: t.Union([t.Literal('running'), t.Literal('completed'), t.Literal('failed')]), progress: t.Number(), message: t.String() })`
          : recipe === "chat"
            ? `message: t.Object({ name: t.String(), text: t.String() })`
            : recipe === "presence"
              ? `presence: t.Object({ connected: t.Number() })`
              : `updated: t.Object({ message: t.String() })`;
  const source = `import { channel } from '@bunway/core/realtime'\nimport { t } from 'elysia'\n\n// ${selectedTransport === "sse" ? "SSE: server-to-client updates" : "WebSocket: bidirectional updates"}\nexport const ${feature}Channel = channel('${route}', {\n  events: {\n    ${events},\n  },\n})\n`;
  await ensureNew(join(cwd, "src", "realtime", `${file}.ts`), source);
  console.log(
    `Transport: ${selectedTransport === "sse" ? "SSE" : "WebSocket"}`,
  );
}
