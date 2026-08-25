import { camel, kebab, insertBefore, CliError } from "../utils";
import { join } from "node:path";
import { ensureNew } from "../writing";

export async function generateJob(raw: string, cwd = process.cwd()) {
  if (!raw) throw new CliError("A job name is required");
  const name = camel(raw);
  const file = kebab(raw);
  const source = `import { job } from '@bunway/core'\n\nexport const ${name} = job('${file}', async (payload: { id: string }) => {\n  console.log('${file}', payload.id)\n})\n`;
  await ensureNew(join(cwd, "src", "jobs", `${file}.ts`), source);
  await insertBefore(
    join(cwd, "src", "jobs", "index.ts"),
    "// bunway:jobs",
    `export { ${name} } from './${file}'`,
  );
}
