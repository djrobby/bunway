import { join } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import type { DatabaseAdapter, DatabaseConnection } from '@bunway/core'
import { CliError, insertBefore, run } from './utils'

export type DatabaseName = string
export type PostgresDriver = 'pg' | 'postgres'

export async function databaseConfig(cwd = process.cwd()) {
  const path = join(cwd, 'src', 'db', 'config.ts')
  if (!await Bun.file(path).exists()) return { primary: { adapter: 'postgres', url: Bun.env.DATABASE_URL } } as Record<string, DatabaseConnection>
  const source = await Bun.file(path).text()
  const databases: Record<string, DatabaseConnection> = {}
  for (const match of source.matchAll(/([a-z][a-zA-Z0-9]*):\s*\{[\s\S]*?adapter:\s*['"](postgres|mysql|sqlite|pocketbase)['"]/g)) {
    databases[match[1]!] = { adapter: match[2] as DatabaseAdapter, url: undefined }
  }
  if (!databases.primary) throw new CliError(`${path} must define a primary database with a literal adapter`)
  return databases
}

export async function database(name = 'primary', cwd = process.cwd()) {
  const databases = await databaseConfig(cwd)
  const connection = databases[name]
  if (!connection) throw new CliError(`Unknown database "${name}". Run bunway db:list to see configured databases.`)
  return connection
}

export const databaseDirectory = (name: string) => name === 'primary' ? join('src', 'db') : join('src', 'db', name)
export const databaseEnv = (name: string) => name === 'primary' ? 'DATABASE_URL' : `${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}_DATABASE_URL`
export const drizzleConfig = (name: string) => name === 'primary' ? 'drizzle.config.ts' : `drizzle.${name}.config.ts`

export async function addDatabase(name: string | undefined, adapter: DatabaseAdapter | undefined, cwd = process.cwd(), postgresDriver?: PostgresDriver) {
  if (!name || !/^[a-z][a-zA-Z0-9]*$/.test(name) || name === 'db') throw new CliError('Database names must start with a lowercase letter and contain only letters and numbers')
  if (name === 'primary') throw new CliError('The primary database already exists')
  if (!adapter || !['postgres', 'mysql', 'sqlite', 'pocketbase'].includes(adapter)) throw new CliError('Adapter must be postgres, mysql, sqlite, or pocketbase')
  const databases = await databaseConfig(cwd)
  if (databases[name]) throw new CliError(`Database "${name}" already exists`)
  const root = join(cwd, databaseDirectory(name))
  if (adapter === 'pocketbase') await mkdir(join(root, 'pb_migrations'), { recursive: true })
  else {
    await mkdir(join(root, 'schema'), { recursive: true })
    await mkdir(join(root, 'migrations'), { recursive: true })
    await Bun.write(join(root, 'schema', 'index.ts'), '// bunway:schemas\n')
  }
  const env = databaseEnv(name)
  const defaultUrl = adapter === 'sqlite' ? `./storage/${name}.sqlite` : undefined
  await insertBefore(join(cwd, 'src', 'db', 'config.ts'), '\n})', `  ${name}: {\n    adapter: '${adapter}',\n    url: ${adapter === 'sqlite' ? `'${defaultUrl}'` : `Bun.env.${env}`},\n  },`)
  const indexPath = join(cwd, 'src', 'db', 'index.ts')
  let index = await Bun.file(indexPath).text()
  const adapterImport = adapter === 'postgres'
    ? "import { drizzle as postgresDrizzle } from 'drizzle-orm/bun-sql'"
    : adapter === 'mysql'
      ? "import { drizzle as mysqlDrizzle } from 'drizzle-orm/mysql2'"
      : adapter === 'sqlite'
        ? "import { drizzle as sqliteDrizzle } from 'drizzle-orm/bun-sqlite'"
        : "import PocketBase from 'pocketbase'"
  if (!index.includes(adapterImport)) await Bun.write(indexPath, `${adapterImport}\n${index}`)
  await insertBefore(indexPath, '// bunway:databases', connectionSource(name, adapter, adapter === 'sqlite' ? `'${defaultUrl}'` : `required('${env}', Bun.env.${env})`))
  if (adapter !== 'pocketbase') await Bun.write(join(cwd, drizzleConfig(name)), drizzleConfigSource(name, adapter, adapter === 'sqlite' ? `'${defaultUrl}'` : `process.env.${env}!`))
  if (adapter !== 'sqlite') {
    const envPath = join(cwd, '.env.example')
    await Bun.write(envPath, `${(await Bun.file(envPath).text()).trimEnd()}\n${env}=\n`)
  }
  if (adapter === 'postgres') await ensurePostgresDependency(cwd, postgresDriver)
  if (adapter === 'mysql') await ensureMysqlDependency(cwd)
  if (adapter === 'pocketbase') await ensurePocketBaseDependency(cwd)
  console.log(`Added ${name} (${adapterLabel(adapter)})`)
}

export async function listDatabases(cwd = process.cwd()) {
  const databases = await databaseConfig(cwd)
  console.log('NAME'.padEnd(16) + 'ADAPTER'.padEnd(14) + 'DEFAULT')
  for (const [name, value] of Object.entries(databases)) console.log(name.padEnd(16) + adapterLabel(value.adapter).padEnd(14) + (name === 'primary' ? 'yes' : ''))
}

export async function migrateDatabases(name: string | undefined, all: boolean, cwd = process.cwd()) {
  const databases = await databaseConfig(cwd)
  const names = all ? Object.keys(databases) : [name ?? 'primary']
  for (const current of names) {
    if (!databases[current]) throw new CliError(`Unknown database "${current}". Run bunway db:list to see configured databases.`)
    console.log(`Migrating ${current} (${adapterLabel(databases[current]!.adapter)})`)
    if (databases[current]!.adapter === 'pocketbase') throw new CliError(`PocketBase owns its migrations. Run the PocketBase executable with "migrate up --migrationsDir=${databaseDirectory(current).replaceAll('\\', '/')}/pb_migrations".`)
    await ensureDatabaseDriver(databases[current]!.adapter, cwd)
    const config = drizzleConfig(current)
    await run(['bunx', '--bun', 'drizzle-kit', 'generate', `--config=${config}`], cwd)
    await run(['bunx', '--bun', 'drizzle-kit', 'migrate', `--config=${config}`], cwd)
  }
}

export function connectionSource(name: string, adapter: DatabaseAdapter, url: string) {
  const exported = name === 'primary' ? 'db' : name
  if (adapter === 'postgres') return `export const ${exported} = postgresDrizzle(new Bun.SQL(${url}))`
  if (adapter === 'mysql') return `export const ${exported} = mysqlDrizzle(${url})`
  if (adapter === 'pocketbase') return `export const ${exported} = new PocketBase(${url})`
  return `export const ${exported} = sqliteDrizzle(${url})`
}

export function drizzleConfigSource(name: string, adapter: DatabaseAdapter, url: string) {
  if (adapter === 'pocketbase') throw new CliError('PocketBase does not use Drizzle Kit')
  const directory = databaseDirectory(name).replaceAll('\\', '/')
  const dialect = adapter === 'postgres' ? 'postgresql' : adapter
  return `import { defineConfig } from 'drizzle-kit'\n\nexport default defineConfig({\n  dialect: '${dialect}',\n  schema: './${directory}/schema/index.ts',\n  out: './${directory}/migrations',\n  dbCredentials: { url: ${url} },\n})\n`
}

export async function configurePrimary(adapter: DatabaseAdapter, cwd: string, postgresDriver?: PostgresDriver) {
  const url = adapter === 'sqlite' ? `'./storage/development.sqlite'` : `required('DATABASE_URL', Bun.env.DATABASE_URL)`
  const imports = adapter === 'postgres'
    ? "import { drizzle as postgresDrizzle } from 'drizzle-orm/bun-sql'"
    : adapter === 'mysql'
      ? "import { drizzle as mysqlDrizzle } from 'drizzle-orm/mysql2'"
      : adapter === 'sqlite'
        ? "import { drizzle as sqliteDrizzle } from 'drizzle-orm/bun-sqlite'"
        : "import PocketBase from 'pocketbase'"
  await Bun.write(join(cwd, 'src', 'db', 'index.ts'), `${imports}\n\nfunction required(name: string, value: string | undefined) {\n  if (!value) throw new Error(\`\${name} is required\`)\n  return value\n}\n\n${connectionSource('primary', adapter, url)}\n// bunway:databases\n`)
  await Bun.write(join(cwd, 'src', 'db', 'config.ts'), `import { defineDatabases } from '@bunway/core'\n\nexport default defineDatabases({\n  primary: {\n    adapter: '${adapter}',\n    url: ${adapter === 'sqlite' ? "'./storage/development.sqlite'" : 'Bun.env.DATABASE_URL'},\n  },\n})\n`)
  if (adapter === 'mysql') await Bun.write(join(cwd, 'src', 'db', 'schema', 'storage.ts'), mysqlStorageSchema)
  if (adapter === 'sqlite') await Bun.write(join(cwd, 'src', 'db', 'schema', 'storage.ts'), sqliteStorageSchema)
  if (adapter !== 'pocketbase') await Bun.write(join(cwd, 'drizzle.config.ts'), drizzleConfigSource('primary', adapter, adapter === 'sqlite' ? "'./storage/development.sqlite'" : 'process.env.DATABASE_URL!'))
  else await rm(join(cwd, 'drizzle.config.ts'), { force: true })
  await rm(join(cwd, 'src', 'db', 'migrate.ts'), { force: true })
  if (adapter === 'postgres') await ensurePostgresDependency(cwd, postgresDriver)
  if (adapter === 'mysql') await ensureMysqlDependency(cwd)
  if (adapter === 'pocketbase') await ensurePocketBaseDependency(cwd)
}

async function ensurePostgresDependency(cwd: string, requested?: PostgresDriver) {
  const path = join(cwd, 'package.json')
  const manifest = await Bun.file(path).json()
  const selected = requested ?? postgresDriverFromManifest(manifest)
  manifest.devDependencies[selected] = manifest.devDependencies[selected] ?? 'latest'
  await Bun.write(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

async function ensureMysqlDependency(cwd: string) {
  const path = join(cwd, 'package.json')
  const manifest = await Bun.file(path).json()
  manifest.dependencies.mysql2 = manifest.dependencies.mysql2 ?? 'latest'
  await Bun.write(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

async function ensurePocketBaseDependency(cwd: string) {
  const path = join(cwd, 'package.json')
  const manifest = await Bun.file(path).json()
  manifest.dependencies.pocketbase = manifest.dependencies.pocketbase ?? 'latest'
  await Bun.write(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

export async function ensureDatabaseDriver(adapter: DatabaseAdapter, cwd: string, requestedPostgresDriver?: PostgresDriver) {
  if (adapter === 'postgres') await ensurePostgresDependency(cwd, requestedPostgresDriver)
  if (adapter === 'mysql') await ensureMysqlDependency(cwd)
  if (adapter === 'pocketbase') await ensurePocketBaseDependency(cwd)

  const manifest = await Bun.file(join(cwd, 'package.json')).json()
  const packageName = adapter === 'postgres'
    ? requestedPostgresDriver ?? postgresDriverFromManifest(manifest)
    : adapter === 'mysql'
      ? 'mysql2'
      : adapter === 'pocketbase'
        ? 'pocketbase'
        : undefined
  if (!packageName) return

  const installed = await Bun.file(join(cwd, 'node_modules', packageName, 'package.json')).exists()
  if (installed) return

  console.log(`Installing ${packageName}, required by the ${adapterLabel(adapter)} tooling`)
  await run(['bun', 'install'], cwd)

  if (!await Bun.file(join(cwd, 'node_modules', packageName, 'package.json')).exists()) {
    throw new CliError(
      `${packageName} is declared but was not installed. Run "bun install" in the application and retry.`,
    )
  }
}

function postgresDriverFromManifest(manifest: Record<string, any>): PostgresDriver {
  if (manifest.devDependencies?.postgres || manifest.dependencies?.postgres) return 'postgres'
  return 'pg'
}

const adapterLabel = (adapter: DatabaseAdapter) => ({ postgres: 'PostgreSQL', mysql: 'MySQL', sqlite: 'SQLite', pocketbase: 'PocketBase' })[adapter]

const mysqlStorageSchema = `import { bigint, index, int, mysqlTable, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/mysql-core'

export const storageBlobs = mysqlTable('storage_blobs', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 255 }).notNull(),
  filename: text('filename').notNull(),
  contentType: varchar('content_type', { length: 255 }).notNull(),
  byteSize: int('byte_size').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
}, (table) => [uniqueIndex('storage_blobs_key_idx').on(table.key)])

export const storageAttachments = mysqlTable('storage_attachments', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  recordType: varchar('record_type', { length: 255 }).notNull(),
  recordId: varchar('record_id', { length: 255 }).notNull(),
  blobId: bigint('blob_id', { mode: 'number', unsigned: true }).notNull().references(() => storageBlobs.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
}, (table) => [
  index('storage_attachments_record_idx').on(table.recordType, table.recordId, table.name),
  index('storage_attachments_blob_idx').on(table.blobId),
])
`

const sqliteStorageSchema = `import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const storageBlobs = sqliteTable('storage_blobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [uniqueIndex('storage_blobs_key_idx').on(table.key)])

export const storageAttachments = sqliteTable('storage_attachments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  recordType: text('record_type').notNull(),
  recordId: text('record_id').notNull(),
  blobId: integer('blob_id').notNull().references(() => storageBlobs.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index('storage_attachments_record_idx').on(table.recordType, table.recordId, table.name),
  index('storage_attachments_blob_idx').on(table.blobId),
])
`
