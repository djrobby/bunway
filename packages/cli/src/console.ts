import { join } from 'node:path'

export function consoleCommand() {
  return ['bun', 'repl']
}

export async function startConsole() {
  const cwd = process.cwd()
  const child = Bun.spawn(consoleCommand(), {
    cwd,
    stdin: 'pipe',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const appPath = JSON.stringify(join(cwd, 'src', 'app.ts'))
  const dbPath = JSON.stringify(join(cwd, 'src', 'db', 'index.ts'))
  const schemaPath = JSON.stringify(join(cwd, 'src', 'db', 'schema', 'index.ts'))
  child.stdin.write(`globalThis.__bunwayModules = await Promise.all([import(${appPath}), import(${dbPath}), import(${schemaPath})]); undefined\n`)
  child.stdin.write("globalThis.app = __bunwayModules[0].app; globalThis.db = __bunwayModules[1].db; globalThis.schema = __bunwayModules[2]; Object.assign(globalThis, schema); delete globalThis.__bunwayModules; console.log('Bunway console ready: app, db, schema, and exported Drizzle tables are available.')\n")
  const forward = (chunk: Buffer) => child.stdin.write(chunk)
  process.stdin.on('data', forward)
  process.stdin.resume()
  process.exitCode = await child.exited
  process.stdin.off('data', forward)
}
