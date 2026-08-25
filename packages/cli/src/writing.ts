import { extname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import { format } from "prettier";
import * as sveltePlugin from "prettier-plugin-svelte";
import { CliError } from "./utils";

export async function formatSource(path: string, content: string) {
  const parser = {
    ".css": "css",
    ".html": "html",
    ".js": "babel",
    ".svelte": "svelte",
    ".ts": "typescript",
  }[extname(path)];
  if (!parser) return content;
  const normalized =
    parser === "svelte"
      ? content
          .replaceAll("><", ">\n<")
          .replace(/(\{(?:#|:|\/|@)[^}]+\})(?=<)/g, "$1\n")
          .replace(/>(?=\{(?:#|:|\/|@))/g, ">\n")
      : content;
  return format(normalized, {
    parser,
    plugins: parser === "svelte" ? [sveltePlugin] : [],
    htmlWhitespaceSensitivity: "ignore",
    printWidth: 100,
    semi: false,
    singleQuote: true,
    tabWidth: 2,
    useTabs: false,
  });
}

export async function ensureNew(path: string, content: string) {
  if (await Bun.file(path).exists())
    throw new CliError(`${path} already exists`);
  await mkdir(join(path, ".."), { recursive: true });
  await Bun.write(path, await formatSource(path, content));
  console.log(`create ${path}`);
}
