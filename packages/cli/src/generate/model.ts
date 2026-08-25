import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import {
  columnFor,
  detectIdEncoding,
  detectIdType,
  idColumnFor,
  parseFields,
  primaryIdColumnFor,
  type Field,
  type IdEncoding,
  type IdType,
} from "../fields";
import { CliError, insertBefore, kebab } from "../utils";
import {
  database as configuredDatabase,
  databaseConfig,
  databaseDirectory,
} from "../databases";
import type { DatabaseAdapter } from "@bunway/core";
import { ensureNew } from "../writing";
import { collectionInfo, names } from "./shared";

export async function resolveRelationshipIdTypes(
  fields: Field[],
  cwd: string,
  database = "primary",
) {
  for (const field of fields) {
    const relationship = field.reference ?? field.collection;
    if (!relationship) continue;
    const path = join(
      cwd,
      databaseDirectory(database),
      "schema",
      `${relationship.file}.ts`,
    );
    if (!(await Bun.file(path).exists())) {
      const databases = await databaseConfig(cwd);
      const owner = Object.keys(databases).find(
        (name) =>
          name !== database &&
          Bun.file(
            join(
              cwd,
              databaseDirectory(name),
              "schema",
              `${relationship.file}.ts`,
            ),
          ).size > 0,
      );
      if (owner)
        throw new CliError(
          `Cannot create a database foreign key from "${database}" to "${owner}". Store the foreign identifier as a normal field instead.`,
        );
      throw new CliError(
        `Referenced schema ${path} does not exist. Generate it in database "${database}" before this resource.`,
      );
    }
    const schema = await Bun.file(path).text();
    relationship.idType = detectIdType(schema);
    relationship.idEncoding = detectIdEncoding(schema);
  }
  return fields;
}

async function schemaSource(
  raw: string,
  specs: string[],
  cwd: string,
  timestamps = true,
  idType: IdType = "uuid",
  adapter: DatabaseAdapter = "postgres",
  database = "primary",
  idEncoding: IdEncoding = "standard",
) {
  const { singular, table } = names(raw);
  const fields = await resolveRelationshipIdTypes(
    parseFields(specs),
    cwd,
    database,
  );
  const columns = fields.filter(
    (field) => !field.collection && !field.attachment,
  );
  const references = fields.filter((field) => field.reference);
  const indexed = fields.filter(
    (field) => field.reference || field.name === "deletedAt",
  );
  const collections = fields.filter((field) => field.collection);
  const joins = collections.map((field) => ({
    field,
    info: collectionInfo(singular, field),
  }));
  const primary = primaryIdColumnFor(idType, adapter, idEncoding);
  const idBuilder = primary.slice(0, primary.indexOf("("));
  const tableBuilder =
    adapter === "postgres"
      ? "pgTable"
      : adapter === "mysql"
        ? "mysqlTable"
        : "sqliteTable";
  const timestampBuilder = adapter === "sqlite" ? "text" : "timestamp";
  const core =
    adapter === "postgres"
      ? "pg-core"
      : adapter === "mysql"
        ? "mysql-core"
        : "sqlite-core";
  const imports = [
    ...new Set([
      tableBuilder,
      idBuilder,
      ...(timestamps ? [timestampBuilder] : []),
      ...(indexed.length ? ["index"] : []),
      ...columns
        .map((field) => columnFor(field, adapter))
        .map((value) => value.slice(0, value.indexOf("("))),
    ]),
  ].sort();
  const referenceImports = [
    ...references.map(
      (field) =>
        `import { ${field.reference!.table} } from './${field.reference!.file}'`,
    ),
    ...joins.flatMap(({ info }) => [
      `import { ${info.table} } from './${info.file}'`,
    ]),
  ].join("\n");
  const indexes = indexed.length
    ? `, (table) => [\n${indexed.map((field) => `  index('${kebab(table).replaceAll("-", "_")}_${field.name}_idx').on(table.${field.name}),`).join("\n")}\n]`
    : "";
  const relationSource =
    references.length || collections.length
      ? `\nexport const ${table}Relations = relations(${table}, ({ one, many }) => ({\n${references.map((field) => `  ${field.reference!.relation}: one(${field.reference!.table}, { fields: [${table}.${field.name}], references: [${field.reference!.table}.id] }),`).join("\n")}${references.length && collections.length ? "\n" : ""}${joins.map(({ field, info }) => `  ${field.collection!.relation}: many(${info.table}),`).join("\n")}\n}))\n`
      : "";
  const timestampColumn =
    adapter === "sqlite"
      ? "text('%s').notNull().$defaultFn(() => new Date().toISOString())"
      : "timestamp('%s', { mode: 'string' }).notNull().defaultNow()";
  const timestampColumns = timestamps
    ? `\n  createdAt: ${timestampColumn.replace("%s", "createdAt")},\n  updatedAt: ${timestampColumn.replace("%s", "updatedAt")},`
    : "";
  const model = singular[0]!.toUpperCase() + singular.slice(1);
  return `${references.length || collections.length ? "import { relations } from 'drizzle-orm'\n" : ""}import { ${imports.join(", ")} } from 'drizzle-orm/${core}'\n${referenceImports}${referenceImports ? "\n" : ""}\nexport const ${table} = ${tableBuilder}('${kebab(table).replaceAll("-", "_")}', {\n  id: ${primary},\n${columns.map((field) => `  ${field.name}: ${columnFor(field, adapter)},`).join("\n")}${timestampColumns}\n}${indexes})\n${relationSource}\nexport type ${model} = typeof ${table}.$inferSelect\n`;
}

export async function generateModel(
  raw: string,
  specs: string[],
  cwd = process.cwd(),
  options: {
    softDelete?: boolean;
    timestamps?: boolean;
    idType?: IdType;
    idEncoding?: IdEncoding;
    database?: string;
  } = {},
) {
  const { singular, table, file } = names(raw);
  const modelSpecs = options.softDelete
    ? [...specs, "deletedAt:datetime:optional"]
    : specs;
  const database = options.database ?? "primary";
  const { adapter } = await configuredDatabase(database, cwd);
  const fields = await resolveRelationshipIdTypes(
    parseFields(modelSpecs),
    cwd,
    database,
  );
  const idType = options.idType ?? "uuid";
  const idEncoding = options.idEncoding ?? "standard";
  if (idType !== "uuid" && options.idEncoding)
    throw new CliError("ID encoding may be configured only for UUID IDs");
  if (adapter === "sqlite" && idType === "bigint")
    throw new CliError(
      "SQLite uses its INTEGER primary key for both integer and bigint IDs; choose --id-type=integer or --id-type=uuid",
    );
  const schemaRoot = join(cwd, databaseDirectory(database), "schema");
  await ensureNew(
    join(schemaRoot, `${file}.ts`),
    await schemaSource(
      raw,
      modelSpecs,
      cwd,
      options.timestamps !== false,
      idType,
      adapter,
      database,
      idEncoding,
    ),
  );
  await insertBefore(
    join(schemaRoot, "index.ts"),
    "// bunway:schemas",
    `export { ${table} } from './${file}'`,
  );
  const attachments = fields.filter((field) => field.attachment);
  if (database !== "primary" && attachments.length)
    throw new CliError(
      "Attachments currently belong to the primary database; define storage integration explicitly for another database",
    );
  if (adapter === "mysql" && attachments.length)
    throw new CliError(
      "Attachment generation currently requires a PostgreSQL or SQLite primary database",
    );
  if (attachments.length) {
    const model = singular[0]!.toUpperCase() + singular.slice(1);
    const source = `import { attachmentHydrator } from '@bunway/core'\nimport { db } from '../db'\nimport { ${table}, type ${model} } from '../db/schema/${file}'\nimport { storageAttachments, storageBlobs } from '../db/schema/storage'\nimport { storage } from '../storage'\n\nexport const hydrate${model} = attachmentHydrator<${model}, { ${attachments.map((field) => `${field.name}: { multiple: ${field.attachment!.multiple} }`).join(", ")} }>({\n  db,\n  tables: { blobs: storageBlobs, attachments: storageAttachments },\n  storage,\n  recordType: '${table}',\n  definitions: { ${attachments.map((field) => `${field.name}: { multiple: ${field.attachment!.multiple} }`).join(", ")} }\n})\n\nexport type Hydrated${model} = ReturnType<typeof hydrate${model}>\n`;
    await mkdir(join(cwd, "src", "models"), { recursive: true });
    await ensureNew(join(cwd, "src", "models", `${file}.ts`), source);
  }
  for (const field of fields.filter((field) => field.collection)) {
    const info = collectionInfo(singular, field);
    const unique = field.collection!.kind === "has_many" ? ".unique()" : "";
    const ownerColumn = idColumnFor(idType, info.ownerId, adapter, idEncoding);
    const relatedColumn = idColumnFor(
      field.collection!.idType ?? "uuid",
      info.relatedId,
      adapter,
      field.collection!.idEncoding,
    );
    const joinBuilders = [
      ...new Set(
        [ownerColumn, relatedColumn].map((value) =>
          value.slice(0, value.indexOf("(")),
        ),
      ),
    ];
    const source = info.polymorphic
      ? `import { relations } from 'drizzle-orm'\nimport { index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'\nimport { ${field.collection!.table} } from './${field.collection!.file}'\n\nexport const ${info.table} = pgTable('${kebab(info.table).replaceAll("-", "_")}', {\n  ${info.relatedId}: integer('${info.relatedId}').notNull().references(() => ${field.collection!.table}.id, { onDelete: 'cascade' }),\n  ${info.ownerType}: text('${info.ownerType}').notNull(),\n  ${info.ownerId}: integer('${info.ownerId}').notNull(),\n}, (table) => [\n  primaryKey({ columns: [table.${info.relatedId}, table.${info.ownerType}, table.${info.ownerId}] }),\n  index('${kebab(info.table).replaceAll("-", "_")}_${field.collection!.polymorphic!.as}_idx').on(table.${info.ownerType}, table.${info.ownerId}),\n])\n\nexport const ${info.table}Relations = relations(${info.table}, ({ one }) => ({\n  ${info.relatedSingular}: one(${field.collection!.table}, { fields: [${info.table}.${info.relatedId}], references: [${field.collection!.table}.id] }),\n}))\n`
      : `import { relations } from 'drizzle-orm'\nimport { integer, pgTable, primaryKey } from 'drizzle-orm/pg-core'\nimport { ${table} } from './${file}'\nimport { ${field.collection!.table} } from './${field.collection!.file}'\n\nexport const ${info.table} = pgTable('${kebab(info.table).replaceAll("-", "_")}', {\n  ${info.ownerId}: integer('${info.ownerId}').notNull().references(() => ${table}.id, { onDelete: 'cascade' }),\n  ${info.relatedId}: integer('${info.relatedId}').notNull().references(() => ${field.collection!.table}.id, { onDelete: 'cascade' })${unique},\n}, (table) => [primaryKey({ columns: [table.${info.ownerId}, table.${info.relatedId}] })])\n\nexport const ${info.table}Relations = relations(${info.table}, ({ one }) => ({\n  ${singular}: one(${table}, { fields: [${info.table}.${info.ownerId}], references: [${table}.id] }),\n  ${info.relatedSingular}: one(${field.collection!.table}, { fields: [${info.table}.${info.relatedId}], references: [${field.collection!.table}.id] }),\n}))\n`;
    let typedSource = source
      .replace(
        "index, integer, pgTable",
        `index, ${joinBuilders.join(", ")}, pgTable`,
      )
      .replace("integer, pgTable", `${joinBuilders.join(", ")}, pgTable`)
      .replace(`integer('${info.ownerId}')`, ownerColumn)
      .replace(`integer('${info.relatedId}')`, relatedColumn);
    if (adapter !== "postgres") {
      const tableBuilder = adapter === "mysql" ? "mysqlTable" : "sqliteTable";
      const core = adapter === "mysql" ? "mysql-core" : "sqlite-core";
      typedSource = typedSource
        .replaceAll("pgTable", tableBuilder)
        .replaceAll("drizzle-orm/pg-core", `drizzle-orm/${core}`);
      if (adapter === "mysql" && info.polymorphic)
        typedSource = typedSource
          .replace("primaryKey, text }", "primaryKey, varchar }")
          .replace(
            `text('${info.ownerType}')`,
            `varchar('${info.ownerType}', { length: 255 })`,
          );
    }
    const joinSource =
      options.timestamps === false
        ? typedSource
        : typedSource
            .replace(
              "primaryKey, text }",
              `primaryKey, text${adapter === "sqlite" ? "" : ", timestamp"} }`,
            )
            .replace(
              "primaryKey, varchar }",
              "primaryKey, varchar, timestamp }",
            )
            .replace(
              "primaryKey }",
              `primaryKey, ${adapter === "sqlite" ? "text" : "timestamp"} }`,
            )
            .replace(
              "\n}, (table) =>",
              adapter === "sqlite"
                ? "\n  createdAt: text('createdAt').notNull().$defaultFn(() => new Date().toISOString()),\n  updatedAt: text('updatedAt').notNull().$defaultFn(() => new Date().toISOString()),\n}, (table) =>"
                : "\n  createdAt: timestamp('createdAt', { mode: 'string' }).notNull().defaultNow(),\n  updatedAt: timestamp('updatedAt', { mode: 'string' }).notNull().defaultNow(),\n}, (table) =>",
            );
    await ensureNew(join(schemaRoot, `${info.file}.ts`), joinSource);
    await insertBefore(
      join(schemaRoot, "index.ts"),
      "// bunway:schemas",
      `export { ${info.table} } from './${info.file}'`,
    );
  }
}
