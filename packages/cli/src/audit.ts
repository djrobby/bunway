import { extname, join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { format } from 'prettier'
import { database, databaseDirectory } from './databases'
import { primaryIdColumnFor, type IdEncoding, type IdType } from './fields'
import { CliError, insertBefore } from './utils'

export type AuditOptions = {
  database?: string
  idType?: IdType
  idEncoding?: IdEncoding
}

async function write(path: string, source: string) {
  if (await Bun.file(path).exists()) throw new CliError(`${path} already exists`)
  await mkdir(join(path, '..'), { recursive: true })
  const content = extname(path) === '.ts'
    ? await format(source, { parser: 'typescript', printWidth: 100, semi: false, singleQuote: true })
    : source
  await Bun.write(path, content)
  console.log(`create ${path}`)
}

function schemaSource(adapter: 'postgres' | 'mysql' | 'sqlite', idType: IdType, idEncoding: IdEncoding) {
  const table = adapter === 'postgres' ? 'pgTable' : adapter === 'mysql' ? 'mysqlTable' : 'sqliteTable'
  const core = adapter === 'postgres' ? 'pg-core' : adapter === 'mysql' ? 'mysql-core' : 'sqlite-core'
  const id = primaryIdColumnFor(idType, adapter, idEncoding)
  const idBuilder = id.slice(0, id.indexOf('('))
  const string = adapter === 'mysql' ? 'varchar' : 'text'
  const stringColumn = (name: string, length = 255) => adapter === 'mysql'
    ? `varchar('${name}', { length: ${length} })`
    : `text('${name}')`
  const timestamp = adapter === 'sqlite'
    ? `text('created_at').notNull().$defaultFn(() => new Date().toISOString())`
    : `timestamp('created_at', { mode: 'string' }).notNull().defaultNow()`
  const metadata = adapter === 'postgres'
    ? `jsonb('metadata').$type<AuditMetadata>()`
    : adapter === 'mysql'
      ? `json('metadata').$type<AuditMetadata>()`
      : `text('metadata', { mode: 'json' }).$type<AuditMetadata>()`
  const imports = [...new Set([
    table,
    idBuilder,
    string,
    'index',
    adapter === 'postgres' ? 'jsonb' : adapter === 'mysql' ? 'json' : 'text',
    ...(adapter === 'sqlite' ? [] : ['timestamp']),
  ])]
  return `import { ${imports.join(', ')} } from 'drizzle-orm/${core}'

export type AuditMetadata = Record<string, unknown>

export const auditLogs = ${table}('audit_logs', {
  id: ${id},
  event: ${stringColumn('event')}.notNull(),
  actorType: ${stringColumn('actor_type')},
  actorId: ${stringColumn('actor_id')},
  subjectType: ${stringColumn('subject_type')},
  subjectId: ${stringColumn('subject_id')},
  metadata: ${metadata},
  createdAt: ${timestamp},
}, (table) => [
  index('audit_logs_event_created_at_idx').on(table.event, table.createdAt),
  index('audit_logs_actor_created_at_idx').on(table.actorType, table.actorId, table.createdAt),
  index('audit_logs_subject_created_at_idx').on(table.subjectType, table.subjectId, table.createdAt),
])

export type AuditLog = typeof auditLogs.$inferSelect
`
}

export const sanitizerSource = `const sensitiveKeys = new Set([
  'password', 'passwordhash', 'token', 'accesstoken', 'refreshtoken', 'authorization', 'cookie',
  'setcookie', 'secret', 'clientsecret', 'apikey', 'otp', 'mfasecret', 'recoverycode',
  'recoverycodes', 'sessiontoken',
])

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '')

function sensitive(key: string, path: string[]) {
  const normalized = normalizeKey(key)
  if (sensitiveKeys.has(normalized)) return true
  return normalized === 'code' && path.some(part => /auth|mfa|otp|recovery|verification/.test(normalizeKey(part)))
}

export function sanitizeAuditMetadata(value: unknown, path: string[] = []): unknown {
  if (Array.isArray(value)) return value.map(item => sanitizeAuditMetadata(item, path))
  if (!value || typeof value !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    output[key] = sensitive(key, path) ? '[REDACTED]' : sanitizeAuditMetadata(item, [...path, key])
  }
  return output
}
`

function auditSource(databaseName: string, idType: IdType, idEncoding: IdEncoding) {
  const dbImport = databaseName === 'primary' ? 'db' : databaseName
  const schemaImport = databaseName === 'primary'
    ? '../db/schema/audit-logs'
    : `../db/${databaseName}/schema/audit-logs`
  const idValue = idType === 'uuid'
    ? `id: Bun.randomUUIDv7(${idEncoding === 'base64url' ? "'base64url'" : ''}),`
    : ''
  return `import { ${dbImport} as auditDatabase } from '../db'
import { auditLogs } from '${schemaImport}'
import { sanitizeAuditMetadata } from './sanitize'

type AuditReference = { type: string; id?: string | number | bigint }
type AuditRecordOptions = {
  actor?: AuditReference
  subject?: AuditReference
  metadata?: Record<string, unknown>
}
const identifier = /^[a-z0-9][a-z0-9._:-]*$/i

function validateIdentifier(label: string, value: string) {
  if (!identifier.test(value) || value.length > 255) throw new Error(\`Audit \${label} is invalid\`)
}

function reference(value: AuditReference | undefined, label: string) {
  if (!value) return {}
  validateIdentifier(\`\${label} type\`, value.type)
  return {
    [\`\${label}Type\`]: value.type,
    [\`\${label}Id\`]: value.id === undefined ? null : String(value.id),
  }
}

export const audit = {
  async record(
    event: string,
    options: AuditRecordOptions = {},
    context: { db?: Pick<typeof auditDatabase, 'insert'> } = {},
  ) {
    validateIdentifier('event', event)
    const values: typeof auditLogs.$inferInsert = {
      ${idValue}
      event,
      ...reference(options.actor, 'actor'),
      ...reference(options.subject, 'subject'),
      metadata: options.metadata
        ? sanitizeAuditMetadata(options.metadata) as Record<string, unknown>
        : null,
    }
    await (context.db ?? auditDatabase).insert(auditLogs).values(values)
    return values
  },
}
`
}

export async function generateAudit(options: AuditOptions = {}, cwd = process.cwd()) {
  const databaseName = options.database ?? 'primary'
  const selected = await database(databaseName, cwd)
  if (selected.adapter === 'pocketbase')
    throw new CliError('Bunway Audit requires a Drizzle database: postgres, mysql, or sqlite')
  const idType = options.idType ?? 'uuid'
  const idEncoding = options.idEncoding ?? 'standard'
  if (idType !== 'uuid' && options.idEncoding)
    throw new CliError('ID encoding may be configured only for UUID audit IDs')
  if (selected.adapter === 'sqlite' && idType === 'bigint')
    throw new CliError('SQLite uses its INTEGER primary key for integer and bigint IDs; choose uuid or integer')
  const schemaRoot = join(cwd, databaseDirectory(databaseName), 'schema')
  await write(join(schemaRoot, 'audit-logs.ts'), schemaSource(selected.adapter, idType, idEncoding))
  await insertBefore(join(schemaRoot, 'index.ts'), '// bunway:schemas', `export { auditLogs } from './audit-logs'`)
  await write(join(cwd, 'src/audit/sanitize.ts'), sanitizerSource)
  await write(join(cwd, 'src/audit/index.ts'), auditSource(databaseName, idType, idEncoding))
  console.log(`\nAudit generated for database "${databaseName}". Run bunway db:migrate${databaseName === 'primary' ? '' : ` --database=${databaseName}`}.`)
}
