import { CliError, camel, kebab, plural } from './utils'
import type { DatabaseAdapter } from '@bunway/core'

export type IdType = 'uuid' | 'integer' | 'bigint'
export type IdEncoding = 'standard' | 'base64url'

export type Field = {
  name: string
  type: string
  unique: boolean
  optional: boolean
  generated?: boolean
  array?: boolean
  enumValues?: string[]
  reference?: { table: string; file: string; relation: string; idType?: IdType; idEncoding?: IdEncoding }
  collection?: {
    kind: 'has_many' | 'many_to_many'
    table: string
    file: string
    relation: string
    idType?: IdType
    idEncoding?: IdEncoding
    polymorphic?: { as: string; through: string }
  }
  attachment?: { multiple: boolean; accept?: string }
}

const types: Record<string, { column: string; validator: string }> = {
  string: { column: 'text', validator: 't.String()' },
  text: { column: 'text', validator: 't.String()' },
  varchar: { column: 'varchar', validator: 't.String()' },
  char: { column: 'char', validator: 't.String()' },
  smallint: { column: 'smallint', validator: 't.Integer()' },
  integer: { column: 'integer', validator: 't.Integer()' },
  bigint: { column: 'bigint', validator: 't.Numeric()' },
  decimal: { column: 'numeric', validator: 't.String()' },
  numeric: { column: 'numeric', validator: 't.String()' },
  real: { column: 'real', validator: 't.Number()' },
  float: { column: 'doublePrecision', validator: 't.Number()' },
  boolean: { column: 'boolean', validator: 't.Boolean()' },
  uuid: { column: 'uuid', validator: 't.String()' },
  date: { column: 'date', validator: 't.String()' },
  time: { column: 'time', validator: 't.String()' },
  datetime: { column: 'timestamp', validator: 't.String()' },
  timestamp: { column: 'timestamp', validator: 't.String()' },
  timestamptz: { column: 'timestamp', validator: 't.String()' },
  interval: { column: 'interval', validator: 't.String()' },
  json: { column: 'json', validator: 't.Any()' },
  jsonb: { column: 'jsonb', validator: 't.Any()' },
  inet: { column: 'inet', validator: 't.String()' },
  cidr: { column: 'cidr', validator: 't.String()' },
  macaddr: { column: 'macaddr', validator: 't.String()' },
  macaddr8: { column: 'macaddr8', validator: 't.String()' },
}

export function parseFields(values: string[]): Field[] {
  return values.map(value => {
    const [rawName, rawType = 'string', ...modifiers] = value.split(':')
    const array = rawType.endsWith('[]')
    const typeExpression = array ? rawType.slice(0, -2) : rawType
    const [type, enumList] = typeExpression.split('=', 2)
    const enumValues = type === 'enum' ? enumList?.split(',').filter(Boolean) : undefined
    const modifier = modifiers.find(value => ['unique', 'optional'].includes(value))
    const relation = camel(rawName ?? '')
    const singularType = ['references', 'belongs_to', 'has_one'].includes(type)
    const collectionType = type === 'has_many' || type === 'many_to_many'
    const attachment = ['image', 'file', 'files'].includes(type)
      ? { multiple: type === 'files', accept: type === 'image' ? 'image/*' : undefined }
      : undefined
    const related = collectionType && relation.endsWith('s') ? relation.slice(0, -1) : relation
    const reference = singularType ? { table: plural(relation), file: kebab(plural(relation)), relation } : undefined
    const polymorphicAs = modifiers.find(value => value.startsWith('as='))?.slice(3)
    const polymorphicThrough = modifiers.find(value => value.startsWith('through='))?.slice(8)
    const polymorphic = polymorphicAs && polymorphicThrough
      ? { as: camel(polymorphicAs), through: camel(polymorphicThrough) }
      : undefined
    const collection = collectionType ? { kind: type as 'has_many' | 'many_to_many', table: plural(related), file: kebab(plural(related)), relation: plural(related), polymorphic } : undefined
    const name = reference ? `${relation}Id` : relation
    if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) throw new CliError(`Invalid field: ${value}`)
    if (!types[type] && type !== 'enum' && !singularType && !collectionType && !attachment) throw new CliError(`Unknown type "${type}". Use: ${Object.keys(types).join(', ')}, enum=value1,value2, type[], image, file, files, references, belongs_to, has_one, has_many, many_to_many`)
    if (type === 'enum' && (!enumValues || enumValues.length < 1)) throw new CliError(`Enum fields require values, for example status:enum=draft,published`)
    if (array && (singularType || collectionType || attachment || type === 'enum')) throw new CliError(`Arrays require a scalar field type in ${value}`)
    const unknown = modifiers.find(value => !['unique', 'optional'].includes(value) && !value.startsWith('as=') && !value.startsWith('through='))
    if (unknown) throw new CliError(`Unknown modifier "${unknown}" in ${value}`)
    if (!!polymorphicAs !== !!polymorphicThrough) throw new CliError(`Polymorphic relationships require both as= and through= in ${value}`)
    if (polymorphic && type !== 'many_to_many') throw new CliError(`Polymorphic as=/through= is supported only for many_to_many relationships`)
    if (polymorphic && (!/^[a-z][a-zA-Z0-9]*$/.test(polymorphic.as) || !/^[a-z][a-zA-Z0-9]*$/.test(polymorphic.through))) throw new CliError(`Invalid polymorphic relationship in ${value}`)
    if ((singularType || collectionType || attachment) && modifier === 'unique') throw new CliError(`Relationship and attachment fields support only the optional modifier`)
    return { name, type, array, enumValues, unique: type === 'has_one' || modifier === 'unique', optional: modifier === 'optional', reference, collection, attachment }
  })
}

export function idColumnFor(idType: IdType, name = 'id', adapter: DatabaseAdapter = 'postgres', encoding: IdEncoding = 'standard') {
  if (idType === 'uuid') {
    if (encoding === 'base64url') return adapter === 'sqlite' ? `text('${name}')` : `varchar('${name}', { length: 22 })`
    return adapter === 'postgres' ? `uuid('${name}')` : adapter === 'mysql' ? `varchar('${name}', { length: 36 })` : `text('${name}')`
  }
  if (idType === 'bigint') return adapter === 'sqlite' ? `integer('${name}', { mode: 'number' })` : `bigint('${name}', { mode: 'number' })`
  return `integer('${name}')`
}

export function primaryIdColumnFor(idType: IdType, adapter: DatabaseAdapter = 'postgres', encoding: IdEncoding = 'standard') {
  if (idType === 'uuid' && encoding === 'base64url') {
    const column = adapter === 'sqlite' ? "text('id')" : "varchar('id', { length: 22 })"
    return `${column}.$defaultFn(() => Bun.randomUUIDv7('base64url')).primaryKey()`
  }
  if (adapter === 'postgres') {
    if (idType === 'uuid') return "uuid('id').$defaultFn(() => Bun.randomUUIDv7()).primaryKey()"
    if (idType === 'bigint') return "bigserial('id', { mode: 'number' }).primaryKey()"
    return "serial('id').primaryKey()"
  }
  if (adapter === 'mysql') {
    if (idType === 'uuid') return "varchar('id', { length: 36 }).$defaultFn(() => Bun.randomUUIDv7()).primaryKey()"
    if (idType === 'bigint') return "bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey()"
    return "int('id', { unsigned: true }).autoincrement().primaryKey()"
  }
  if (idType === 'uuid') return "text('id').$defaultFn(() => Bun.randomUUIDv7()).primaryKey()"
  return "integer('id').primaryKey({ autoIncrement: true })"
}

export function detectIdType(schema: string): IdType {
  if (/\bid:\s*(?:uuid|varchar|text)\(/.test(schema) && /Bun\.randomUUIDv7\(/.test(schema)) return 'uuid'
  if (/\bid:\s*(?:bigserial|bigint)\(/.test(schema)) return 'bigint'
  return 'integer'
}

export function detectIdEncoding(schema: string): IdEncoding {
  return /Bun\.randomUUIDv7\(['"]base64url['"]\)/.test(schema) ? 'base64url' : 'standard'
}

export const columnFor = (field: Field, adapter: DatabaseAdapter = 'postgres') => {
  if (field.reference) return `${idColumnFor(field.reference.idType ?? 'uuid', field.name, adapter, field.reference.idEncoding)}.${field.optional ? '' : 'notNull().' }references(() => ${field.reference.table}.id)${field.unique ? '.unique()' : ''}`
  if (field.collection || field.attachment) throw new CliError(`${field.type} is not a database column`)
  if (adapter !== 'postgres' && ['timestamptz', 'interval', 'jsonb', 'inet', 'cidr', 'macaddr', 'macaddr8'].includes(field.type)) throw new CliError(`${field.type} is PostgreSQL-specific; edit the Drizzle schema directly or choose a type supported by ${adapter}`)
  if (field.array && adapter !== 'postgres') throw new CliError(`Array columns are PostgreSQL-specific; use json or an explicit related table for ${adapter}`)
  let builder = field.type === 'enum'
    ? `text('${field.name}', { enum: [${field.enumValues!.map(value => `'${value}'`).join(', ')}] })`
    : field.type === 'bigint'
      ? adapter === 'sqlite' ? `integer('${field.name}', { mode: 'number' })` : `bigint('${field.name}', { mode: 'number' })`
      : ['datetime', 'timestamp'].includes(field.type)
        ? adapter === 'sqlite' ? `text('${field.name}')` : `timestamp('${field.name}', { mode: 'string' })`
        : field.type === 'timestamptz'
          ? `timestamp('${field.name}', { mode: 'string', withTimezone: true })`
          : adapter === 'mysql' && field.type === 'integer' ? `int('${field.name}')`
          : adapter === 'mysql' && field.type === 'uuid' ? `varchar('${field.name}', { length: 36 })`
          : adapter === 'mysql' && field.type === 'float' ? `double('${field.name}')`
          : adapter === 'mysql' && ['decimal', 'numeric'].includes(field.type) ? `decimal('${field.name}')`
          : adapter === 'sqlite' && ['boolean', 'smallint', 'integer'].includes(field.type) ? `integer('${field.name}', { mode: '${field.type === 'boolean' ? 'boolean' : 'number'}' })`
          : adapter === 'sqlite' && ['decimal', 'numeric', 'real', 'float'].includes(field.type) ? `real('${field.name}')`
          : adapter === 'sqlite' && field.type === 'json' ? `text('${field.name}', { mode: 'json' })`
          : adapter === 'sqlite' && ['string', 'text', 'varchar', 'char', 'uuid', 'date', 'time'].includes(field.type) ? `text('${field.name}')`
          : `${types[field.type].column}('${field.name}')`
  if (field.array) builder += '.array()'
  return `${builder}${field.optional ? '' : field.type === 'boolean' ? ".notNull().default(false)" : '.notNull()'}${field.unique ? '.unique()' : ''}`
}

export const validatorFor = (field: Field) => {
  if (field.collection) throw new CliError(`${field.type} is not part of the resource body`)
  if (field.attachment) {
    const validator = field.attachment.multiple ? 't.Files()' : 't.File()'
    return field.optional ? `t.Optional(${validator})` : validator
  }
  let validator = field.reference
    ? field.reference.idType === 'uuid' ? 't.String()' : 't.Numeric()'
    : field.type === 'enum'
      ? `t.Union([${field.enumValues!.map(value => `t.Literal('${value}')`).join(', ')}])`
      : types[field.type].validator
  if (field.array) validator = `t.Array(${validator})`
  return field.optional ? `t.Optional(${validator})` : validator
}
