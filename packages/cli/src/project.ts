import { basename, join, resolve } from 'node:path'
import { cp, rename, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { CliError, run } from './utils'
import { configurePrimary } from './databases'
import type { DatabaseAdapter } from '@bunway/core'

export async function createProject(name?: string, options: { install?: boolean; apiOnly?: boolean; database?: DatabaseAdapter } = {}) {
  if (!name) throw new CliError('Provide an application name: bun create bunway myapp')
  const target = resolve(name)
  const appName = basename(target)
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(appName)) throw new CliError('Application names may contain letters, numbers, hyphens, and underscores')
  if (existsSync(target)) throw new CliError(`${target} already exists`)
  const template = join(import.meta.dir, '..', 'template')
  await copyDirectory(template, target)
  await rename(join(target, 'tests', 'app.test.ts.template'), join(target, 'tests', 'app.test.ts'))
  const packagePath = join(target, 'package.json')
  const manifest = await Bun.file(packagePath).json()
  manifest.name = appName.toLowerCase()
  const adapter = options.database ?? 'postgres'
  if (!['postgres', 'mysql', 'sqlite', 'pocketbase'].includes(adapter)) throw new CliError('Database must be postgres, mysql, sqlite, or pocketbase')
  if (options.apiOnly) {
    await rm(join(target, 'web'), { recursive: true, force: true })
    delete manifest.workspaces
    manifest.scripts.build = 'bun build src/app.ts --target=bun --outdir=dist'
    manifest.scripts.typecheck = 'bunx tsc --noEmit'
    await Bun.write(join(target, '.bunway-api-only'), 'API-only Bunway application\n')
  }
  await Bun.write(packagePath, `${JSON.stringify(manifest, null, 2)}\n`)
  await configurePrimary(adapter, target)
  if (adapter === 'sqlite') {
    const envPath = join(target, '.env.example')
    await Bun.write(envPath, (await Bun.file(envPath).text()).replace(/^DATABASE_URL=.*\r?\n/m, 'DATABASE_URL=./storage/development.sqlite\n'))
  } else if (adapter === 'mysql') {
    const envPath = join(target, '.env.example')
    await Bun.write(envPath, (await Bun.file(envPath).text()).replace(/^DATABASE_URL=.*$/m, 'DATABASE_URL=mysql://root:password@localhost:3306/bunway_development'))
  } else if (adapter === 'pocketbase') {
    const envPath = join(target, '.env.example')
    await Bun.write(envPath, (await Bun.file(envPath).text()).replace(/^DATABASE_URL=.*$/m, 'DATABASE_URL=http://127.0.0.1:8090'))
  }
  console.log(`Created ${target}`)
  if (options.install !== false) await run(['bun', 'install'], target)
  const migrate = adapter === 'pocketbase' ? '  # Start PocketBase; it owns pb_migrations\n' : '  bunway db:migrate\n'
  console.log(`\nNext:\n  cd ${name}\n  copy .env.example .env\n${migrate}  bunway dev`)
}

async function copyDirectory(source: string, target: string) {
  await cp(source, target, { recursive: true })
}
