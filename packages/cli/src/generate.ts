import { extname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import { format } from "prettier";
import * as sveltePlugin from "prettier-plugin-svelte";
import {
  columnFor,
  detectIdEncoding,
  detectIdType,
  idColumnFor,
  parseFields,
  primaryIdColumnFor,
  validatorFor,
  type Field,
  type IdEncoding,
  type IdType,
} from "./fields";
import {
  CliError,
  camel,
  humanize,
  insertBefore,
  kebab,
  plural,
  resourceIcon,
} from "./utils";
import {
  database as configuredDatabase,
  databaseConfig,
  databaseDirectory,
} from "./databases";
import type { DatabaseAdapter } from "@bunway/core";

async function formatSource(path: string, content: string) {
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

async function ensureNew(path: string, content: string) {
  if (await Bun.file(path).exists())
    throw new CliError(`${path} already exists`);
  await Bun.write(path, await formatSource(path, content));
  console.log(`create ${path}`);
}

function names(raw: string) {
  if (!raw) throw new CliError("A name is required");
  const singular = camel(raw);
  return { singular, table: plural(singular), file: kebab(plural(singular)) };
}

function alignmentFor(type: string) {
  if (
    ["boolean", "integer", "references", "belongs_to", "has_one"].includes(type)
  )
    return "text-center";
  if (["decimal", "float"].includes(type)) return "text-right";
  return "text-left";
}

function collectionInfo(
  owner: string,
  field: ReturnType<typeof parseFields>[number],
) {
  const related = field.collection!;
  const relatedSingular = related.relation.endsWith("s")
    ? related.relation.slice(0, -1)
    : related.relation;
  const relatedId = `${relatedSingular}Id`;
  if (related.polymorphic) {
    return {
      ...related,
      ownerId: `${related.polymorphic.as}Id`,
      ownerType: `${related.polymorphic.as}Type`,
      relatedId,
      table: related.polymorphic.through,
      file: kebab(related.polymorphic.through),
      relatedSingular,
      polymorphic: true as const,
    };
  }
  const ownerId = `${owner}Id`;
  const table = `${plural(owner)}To${related.table[0]!.toUpperCase()}${related.table.slice(1)}`;
  return {
    ...related,
    ownerId,
    ownerType: undefined,
    relatedId,
    table,
    file: kebab(table),
    relatedSingular,
    polymorphic: false as const,
  };
}

async function resolveRelationshipIdTypes(
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

const idValidator = (idType: IdType) =>
  idType === "uuid" ? "t.String()" : "t.Numeric()";
const idValue = (expression: string, idType: IdType) =>
  idType === "uuid" ? expression : `Number(${expression})`;

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

export async function generateResource(
  raw: string,
  specs: string[],
  cwd = process.cwd(),
  options: {
    ui?: boolean;
    actions?: string[];
    softDelete?: boolean;
    timestamps?: boolean;
    idType?: IdType;
    idEncoding?: IdEncoding;
    database?: string;
  } = {},
) {
  const { singular, table, file } = names(raw);
  const database = options.database ?? "primary";
  const { adapter } = await configuredDatabase(database, cwd);
  if (adapter === "mysql" && options.softDelete)
    throw new CliError(
      "MySQL soft-delete resource generation is not yet supported; add the nullable timestamp and route conditions explicitly",
    );
  const fields = await resolveRelationshipIdTypes(
    parseFields(specs),
    cwd,
    database,
  );
  const resourceIdType = options.idType ?? "uuid";
  const columns = fields.filter(
    (field) => !field.collection && !field.attachment,
  );
  const attachments = fields.filter((field) => field.attachment);
  if (database !== "primary" && options.ui)
    throw new CliError(
      "Frontend scaffolding currently targets resources in the primary database",
    );
  const collections = fields
    .filter((field) => field.collection)
    .map((field) => ({ field, info: collectionInfo(singular, field) }));
  const polymorphicCleanup = collections
    .filter(({ info }) => info.polymorphic)
    .map(
      ({ info }) =>
        `await db.delete(${info.table}).where(and(eq(${info.table}.${info.ownerType}, '${singular[0]!.toUpperCase() + singular.slice(1)}'), eq(${info.table}.${info.ownerId}, existing.id)))`,
    )
    .join("\n    ");
  const actions = options.actions ?? [
    "index",
    "show",
    "create",
    "update",
    "destroy",
  ];
  const schemaPath = join(
    cwd,
    databaseDirectory(database),
    "schema",
    `${file}.ts`,
  );
  const routePath = join(cwd, "src", "routes", `${file}.ts`);
  if (
    options.ui &&
    (await Bun.file(schemaPath).exists()) &&
    (await Bun.file(routePath).exists())
  ) {
    await generateResourceUi(raw, fields, cwd, actions);
    await registerResource(cwd, table);
    return;
  }
  await generateModel(raw, specs, cwd, {
    softDelete: options.softDelete,
    timestamps: options.timestamps,
    idType: resourceIdType,
    idEncoding: options.idEncoding,
    database,
  });
  const inputFields = [...columns, ...attachments];
  const validators = inputFields
    .map((field) => {
      if (attachments.length && field.type === "boolean")
        return `    ${field.name}: t.Union([t.Boolean(), t.Literal('true'), t.Literal('false')]),`;
      if (
        attachments.length &&
        (["smallint", "integer", "bigint", "real", "float"].includes(
          field.type,
        ) ||
          (field.reference && field.reference.idType !== "uuid"))
      )
        return `    ${field.name}: t.Numeric(),`;
      return `    ${field.name}: ${validatorFor(field)},`;
    })
    .join("\n");
  const model = singular[0]!.toUpperCase() + singular.slice(1);
  const attachmentNames = attachments.map((field) => field.name);
  const multipartValues = columns
    .map((field) =>
      field.type === "boolean"
        ? `${field.name}: ${field.optional ? `input.${field.name} === undefined ? undefined : ` : ""}input.${field.name} === true || input.${field.name} === 'true'`
        : ["smallint", "integer", "bigint", "real", "float"].includes(
              field.type,
            ) ||
            (field.reference && field.reference.idType !== "uuid")
          ? `${field.name}: ${field.optional ? `input.${field.name} === undefined ? undefined : ` : ""}Number(input.${field.name})`
          : `${field.name}: input.${field.name}`,
    )
    .join(", ");
  const valuesSource = attachments.length
    ? `const { ${attachmentNames.join(", ")}, ...input } = body\n    const values = { ${multipartValues} }`
    : "const values = body";
  const updateValues =
    options.timestamps === false
      ? "values"
      : `{ ...values, updatedAt: new Date().toISOString() }`;
  const attachSource = attachments
    .map((field) =>
      field.attachment!.multiple
        ? `for (const file of ${field.name} ?? []) await hydrated.${field.name}.attach(uploadedFile(file))`
        : `if (${field.name}) await hydrated.${field.name}.attach(uploadedFile(${field.name}))`,
    )
    .join("\n    ");
  const imageValidation = attachments
    .filter((field) => field.type === "image")
    .map(
      (field) =>
        `body.${field.name} && !body.${field.name}.type.startsWith('image/')`,
    )
    .join(" || ");
  const serializeSource = attachments.length
    ? `\nasync function serialize(record: typeof ${table}.$inferSelect) {\n  const hydrated = hydrate${model}(record)\n  return { ...record, ${attachments.flatMap((field) => [`${field.name}${field.attachment!.multiple ? "Urls" : "Url"}: await hydrated.${field.name}.${field.attachment!.multiple ? "urls()" : "url()"}`, `${field.name}${field.attachment!.multiple ? "Attachments" : "Attachment"}: await hydrated.${field.name}.${field.attachment!.multiple ? "items()" : "item()"}`]).join(", ")} }\n}\n`
    : "";
  const associationSource = collections.length
    ? `\nasync function withAssociations<T extends typeof ${table}.$inferSelect>(records: T[]) {\n${collections
        .map(({ field, info }) => {
          const condition = info.polymorphic
            ? `and(eq(${info.table}.${info.ownerType}, '${model}'), inArray(${info.table}.${info.ownerId}, records.map(record => record.id)))`
            : `inArray(${info.table}.${info.ownerId}, records.map(record => record.id))`;
          return `  const ${field.collection!.relation}Rows = records.length ? await db.select({ ownerId: ${info.table}.${info.ownerId}, relatedId: ${info.table}.${info.relatedId} }).from(${info.table}).where(${condition}) : []`;
        })
        .join(
          "\n",
        )}\n  return records.map(record => ({ ...record, ${collections.map(({ field }) => `${field.collection!.relation}Ids: ${field.collection!.relation}Rows.filter(row => row.ownerId === record.id).map(row => row.relatedId)`).join(", ")} }))\n}\n`
    : "";
  const routeParts = [
    `export const ${table}Routes = new Elysia({ prefix: '/${kebab(table)}' })`,
  ];
  const resourceId = idValue("params.id", resourceIdType);
  const resourceIdValidator = idValidator(resourceIdType);
  const recordCondition = options.softDelete
    ? `and(eq(${table}.id, ${resourceId}), isNull(${table}.deletedAt))`
    : `eq(${table}.id, ${resourceId})`;
  const textColumns = columns.filter(
    (field) => !field.array && ["string", "text"].includes(field.type),
  );
  const defaultSort = columns.some((field) => field.name === "position")
    ? "position"
    : "id";
  const match = adapter === "postgres" ? "ilike" : "like";
  const textFilter = textColumns.length
    ? `or(${textColumns.map((field) => `${match}(${table}.${field.name}, \`%\${query.filter!.trim()}%\`)`).join(", ")})`
    : "undefined";
  const filterCondition = options.softDelete
    ? `query.filter?.trim() ? and(isNull(${table}.deletedAt), ${textFilter}) : isNull(${table}.deletedAt)`
    : textColumns.length
      ? `query.filter?.trim() ? ${textFilter} : undefined`
      : "undefined";
  const sortableColumns = [
    `id: ${table}.id`,
    ...columns.map((field) => `${field.name}: ${table}.${field.name}`),
  ].join(", ");
  const serializedRecords = attachments.length
    ? "await Promise.all(records.map(serialize))"
    : "records";
  const associatedRecords = collections.length
    ? `await withAssociations(${serializedRecords})`
    : serializedRecords;
  const serializedRecord = attachments.length
    ? "await serialize(record)"
    : "record";
  const associatedRecord = collections.length
    ? `(await withAssociations([${serializedRecord}]))[0]`
    : serializedRecord;
  if (actions.includes("index"))
    routeParts.push(
      `  .get('/', async ({ query }) => {\n    const page = Math.max(1, Number(query.page ?? 1))\n    const requested = query.perPage ?? '50'\n    const perPage = requested === 'all' ? null : Math.min(250, Math.max(1, Number(requested) || 50))\n    const condition = ${filterCondition}\n    const sortColumns = { ${sortableColumns} }\n    const sortColumn = sortColumns[query.sort as keyof typeof sortColumns] ?? sortColumns.${defaultSort}\n    const direction = query.order === 'desc' ? desc : asc\n    const [{ total }] = condition ? await db.select({ total: count() }).from(${table}).where(condition) : await db.select({ total: count() }).from(${table})\n    const base = condition ? db.select().from(${table}).where(condition) : db.select().from(${table})\n    const records = perPage === null\n      ? await base.orderBy(direction(sortColumn))\n      : await base.orderBy(direction(sortColumn)).limit(perPage).offset((page - 1) * perPage)\n    return { records: ${associatedRecords}, total }\n  }, { query: t.Object({ page: t.Optional(t.String()), perPage: t.Optional(t.String()), filter: t.Optional(t.String()), sort: t.Optional(t.String()), order: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')])) }) })`,
    );
  if (actions.includes("show"))
    routeParts.push(
      `  .get('/:id', async ({ params, status }) => {\n    const [record] = await db.select().from(${table}).where(${recordCondition}).limit(1)\n    return record ? ${associatedRecord} : status(404, { message: '${singular} not found' })\n  }, { params: t.Object({ id: ${resourceIdValidator} }) })`,
    );
  if (actions.includes("create"))
    routeParts.push(
      `  .post('/', async ({ body, status }) => {\n    ${imageValidation ? `if (${imageValidation}) return status(422, { message: 'image must be an image file' })\n    ` : ""}${valuesSource}\n    const [record] = await db.insert(${table}).values(values).returning()\n    ${attachments.length ? `const hydrated = hydrate${model}(record)\n    ${attachSource}` : ""}\n    return status(201, ${attachments.length ? "await serialize(record)" : "record"})\n  }, { body })`,
    );
  if (actions.includes("update"))
    routeParts.push(
      `  .patch('/:id', async ({ params, body, status }) => {\n    ${imageValidation ? `if (${imageValidation}) return status(422, { message: 'image must be an image file' })\n    ` : ""}${valuesSource}\n    const [record] = await db.update(${table}).set(${updateValues}).where(${recordCondition}).returning()\n    if (!record) return status(404, { message: '${singular} not found' })\n    ${attachments.length ? `const hydrated = hydrate${model}(record)\n    ${attachSource}` : ""}\n    return ${attachments.length ? "serialize(record)" : "record"}\n  }, { params: t.Object({ id: ${resourceIdValidator} }), body: t.Partial(body) })`,
    );
  if (actions.includes("destroy"))
    routeParts.push(
      options.softDelete
        ? `  .delete('/:id', async ({ params, status }) => {\n    const [record] = await db.update(${table}).set({ deletedAt: new Date().toISOString() }).where(${recordCondition}).returning()\n    return record ? status(204) : status(404, { message: '${singular} not found' })\n  }, { params: t.Object({ id: ${resourceIdValidator} }) })`
        : `  .delete('/:id', async ({ params, status }) => {\n    const [existing] = await db.select().from(${table}).where(eq(${table}.id, ${resourceId})).limit(1)\n    if (!existing) return status(404, { message: '${singular} not found' })\n    ${attachments.length ? `const hydrated = hydrate${model}(existing)\n    await Promise.all([${attachments.map((field) => `hydrated.${field.name}.purge()`).join(", ")}])` : ""}\n    ${polymorphicCleanup}${polymorphicCleanup ? "\n    " : ""}await db.delete(${table}).where(eq(${table}.id, existing.id))\n    return status(204)\n  }, { params: t.Object({ id: ${resourceIdValidator} }) })`,
    );
  if (options.softDelete)
    routeParts.push(
      `  .patch('/:id/restore', async ({ params, status }) => {\n    const [record] = await db.update(${table}).set({ deletedAt: null }).where(eq(${table}.id, ${resourceId})).returning()\n    return record ?? status(404, { message: '${singular} not found' })\n  }, { params: t.Object({ id: ${resourceIdValidator} }) })`,
    );
  for (const field of attachments) {
    if (field.attachment!.multiple)
      routeParts.push(
        `  .delete('/:id/${kebab(field.name)}/:blobId', async ({ params, status }) => {\n    const [record] = await db.select().from(${table}).where(eq(${table}.id, ${resourceId})).limit(1)\n    if (!record) return status(404, { message: '${singular} not found' })\n    await hydrate${model}(record).${field.name}.purge(Number(params.blobId))\n    return status(204)\n  }, { params: t.Object({ id: ${resourceIdValidator}, blobId: t.Numeric() }) })`,
      );
    else
      routeParts.push(
        `  .delete('/:id/${kebab(field.name)}', async ({ params, status }) => {\n    const [record] = await db.select().from(${table}).where(eq(${table}.id, ${resourceId})).limit(1)\n    if (!record) return status(404, { message: '${singular} not found' })\n    await hydrate${model}(record).${field.name}.purge()\n    return status(204)\n  }, { params: t.Object({ id: ${resourceIdValidator} }) })`,
      );
  }
  for (const { field, info } of collections) {
    const ownerCondition = info.polymorphic
      ? `and(eq(${info.table}.${info.ownerType}, '${model}'), eq(${info.table}.${info.ownerId}, ${resourceId}))`
      : `eq(${info.table}.${info.ownerId}, ${resourceId})`;
    routeParts.push(
      `  .get('/:id/${kebab(field.collection!.relation)}', async ({ params }) => {\n    const rows = await db.select({ id: ${info.table}.${info.relatedId} }).from(${info.table}).where(${ownerCondition})\n    return rows.map(row => row.id)\n  }, { params: t.Object({ id: t.Numeric() }) })`,
    );
    const reassign =
      field.collection!.kind === "has_many"
        ? `\n      if (body.ids.length) await tx.delete(${info.table}).where(inArray(${info.table}.${info.relatedId}, body.ids))`
        : "";
    const deleteCondition = info.polymorphic
      ? `and(eq(${info.table}.${info.ownerType}, '${model}'), eq(${info.table}.${info.ownerId}, ownerId))`
      : `eq(${info.table}.${info.ownerId}, ownerId)`;
    const associationValues = info.polymorphic
      ? `{ ${info.ownerType}: '${model}', ${info.ownerId}: ownerId, ${info.relatedId} }`
      : `{ ${info.ownerId}: ownerId, ${info.relatedId} }`;
    routeParts.push(
      `  .put('/:id/${kebab(field.collection!.relation)}', async ({ params, body, status }) => {\n    const ownerId = Number(params.id)\n    await db.transaction(async (tx) => {\n      await tx.delete(${info.table}).where(${deleteCondition})${reassign}\n      if (body.ids.length) await tx.insert(${info.table}).values(body.ids.map(${info.relatedId} => (${associationValues})))\n    })\n    return status(204)\n  }, { params: t.Object({ id: t.Numeric() }), body: t.Object({ ids: t.Array(t.Integer(), { uniqueItems: true }) }) })`,
    );
    routeParts[routeParts.length - 1] = routeParts
      .at(-1)!
      .replace(
        "t.Array(t.Integer()",
        `t.Array(${idValidator(field.collection!.idType ?? "uuid")}`,
      );
  }
  const joinImports = collections
    .map(
      ({ info }) => `import { ${info.table} } from '../db/schema/${info.file}'`,
    )
    .join("\n");
  const drizzleImports = [
    "asc",
    "count",
    "desc",
    "eq",
    ...(options.softDelete || collections.some(({ info }) => info.polymorphic)
      ? ["and"]
      : []),
    ...(options.softDelete ? ["isNull"] : []),
    ...(textColumns.length ? [match, "or"] : []),
    ...(collections.length ? ["inArray"] : []),
  ];
  let routesSource = routeParts
    .join("\n")
    .replaceAll("Number(params.id)", resourceId)
    .replaceAll("id: t.Numeric()", `id: ${resourceIdValidator}`);
  if (adapter === "mysql") {
    routesSource = routesSource
      .replace(
        `const [record] = await db.insert(${table}).values(values).returning()`,
        `const [created] = await db.insert(${table}).values(values).$returningId()\n    const [record] = await db.select().from(${table}).where(eq(${table}.id, created.id)).limit(1)`,
      )
      .replace(
        `const [record] = await db.update(${table}).set(${updateValues}).where(${recordCondition}).returning()`,
        `const [existing] = await db.select().from(${table}).where(${recordCondition}).limit(1)\n    if (!existing) return status(404, { message: '${singular} not found' })\n    await db.update(${table}).set(${updateValues}).where(eq(${table}.id, existing.id))\n    const [record] = await db.select().from(${table}).where(eq(${table}.id, existing.id)).limit(1)`,
      );
  }
  const databaseImport = database === "primary" ? "db" : `${database} as db`;
  const schemaImport =
    database === "primary"
      ? `../db/schema/${file}`
      : `../db/${database}/schema/${file}`;
  const route = `import { Elysia, t } from 'elysia'\nimport { ${drizzleImports.join(", ")} } from 'drizzle-orm'\n${attachments.length ? "import { uploadedFile } from '@bunway/core'\n" : ""}import { ${databaseImport} } from '../db'\nimport { ${table} } from '${schemaImport}'\n${attachments.length ? `import { hydrate${model} } from '../models/${file}'\n` : ""}${joinImports}${joinImports ? "\n" : ""}\nconst body = t.Object({\n${validators}\n})\n${serializeSource}${associationSource}\n${routesSource}\n`;
  await ensureNew(join(cwd, "src", "routes", `${file}.ts`), route);
  await insertBefore(
    join(cwd, "src", "routes", "index.ts"),
    "// bunway:imports",
    `import { ${table}Routes } from './${file}'`,
  );
  await insertBefore(
    join(cwd, "src", "routes", "index.ts"),
    "// bunway:routes",
    `  .use(${table}Routes)`,
  );
  const test = `import { describe, expect, test } from 'bun:test'\nimport { app } from '../src/app'\n\ndescribe('${table}', () => {\n  test('validates create input', async () => {\n    const response = await app.handle(new Request('http://localhost/${kebab(table)}', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))\n    expect(response.status).toBe(422)\n  })\n})\n`;
  await ensureNew(join(cwd, "tests", `${file}.test.ts`), test);
  if (options.ui) {
    await generateResourceUi(raw, fields, cwd, actions);
    await registerResource(cwd, table);
  }
}

async function registerResource(cwd: string, table: string) {
  const path = join(cwd, "web", "src", "lib", "resources.ts");
  if (!(await Bun.file(path).exists()))
    await Bun.write(
      path,
      `export type ResourceNavigationItem = { label: string; href: string; icon: string }\n\nexport const resources: readonly ResourceNavigationItem[] = [\n  // bunway:resources\n]\n`,
    );
  else {
    const source = await Bun.file(path).text();
    if (!source.includes("icon: string"))
      await Bun.write(
        path,
        source
          .replace(
            "label: string; href: string",
            "label: string; href: string; icon: string",
          )
          .replace(
            /\{ label: '([^']+)', href: '([^']+)' \}/g,
            "{ label: '$1', href: '$2', icon: 'database' }",
          ),
      );
  }
  const label = humanize(table);
  await insertBefore(
    path,
    "// bunway:resources",
    `  { label: '${label}', href: '/${kebab(table)}', icon: '${resourceIcon(table)}' },`,
  );
}

async function generateResourceUi(
  raw: string,
  fields: ReturnType<typeof parseFields>,
  cwd: string,
  actions: string[],
) {
  if (fields.some((field) => field.reference || field.collection))
    return generateReferenceResourceUi(raw, fields, cwd, actions);
  await ensureScaffoldComponents(cwd);
  const { singular, table, file } = names(raw);
  const model = singular[0]!.toUpperCase() + singular.slice(1);
  const allFields = fields;
  const columns = fields.filter((field) => !field.attachment);
  const editableFields = fields.filter((field) => !field.generated);
  const editableColumns = columns.filter((field) => !field.generated);
  const attachments = fields.filter((field) => field.attachment);
  const defaults = editableFields
    .map(
      (field) =>
        `${field.name}: ${field.attachment ? `undefined as ${field.attachment.multiple ? "File[]" : "File"} | undefined` : field.type === "boolean" ? "false" : ["integer", "float", "references"].includes(field.type) ? "0" : "''"}`,
    )
    .join(", ");
  const controls = editableFields
    .map((field) => {
      if (field.attachment)
        return `    <label class="grid gap-1"><span class="text-sm font-medium">${field.name}</span><input type="file"${field.attachment.multiple ? " multiple" : ""}${field.attachment.accept ? ` accept="${field.attachment.accept}"` : ""} onchange={(event) => { const files = event.currentTarget.files; form.${field.name} = ${field.attachment.multiple ? "files ? Array.from(files) : []" : "files?.[0]"} }} /></label>`;
      if (field.type === "boolean")
        return `    <label class="flex items-center justify-between gap-4 rounded-md border p-3"><span class="text-sm font-medium capitalize">${field.name}</span><span class="flex items-center gap-2"><Switch bind:checked={form.${field.name}} /><span class="w-8 text-xs font-semibold">{form.${field.name} ? 'ON' : 'OFF'}</span></span></label>`;
      if (
        ["date", "time", "datetime", "timestamp", "timestamptz"].includes(
          field.type,
        )
      )
        return `    <DateField label="${field.name}" type="${field.type === "date" || field.type === "time" ? field.type : "datetime"}" bind:value={form.${field.name}} />`;
      const inputType = ["integer", "float", "references"].includes(field.type)
        ? "number"
        : "text";
      return `    <label class="grid gap-1"><span class="text-sm font-medium">${field.name}</span><input class="rounded-md border border-zinc-300 px-3 py-2" type="${inputType}" bind:value={form.${field.name}} required /></label>`;
    })
    .join("\n");
  fields = editableColumns;
  const attachmentCells = attachments
    .map(
      (field) =>
        `        <td class="w-0 px-3 py-2 text-center"><AttachmentBadge label="${field.name}" items={${field.attachment!.multiple ? `record.${field.name}Attachments` : `record.${field.name}Attachment ? [record.${field.name}Attachment] : []`}} onremove={(blobId) => remove${field.name[0]!.toUpperCase() + field.name.slice(1)}(record.id, blobId)} /></td>`,
    )
    .join("\n");
  const attachmentHeadings = attachments
    .map(
      (field) =>
        `        <ResizableHead resource="${kebab(table)}" column="${field.name}" class="px-3 py-2 text-center">${humanize(field.name)}</ResizableHead>`,
    )
    .join("\n");
  const cells =
    `        <td class="w-0 px-3 py-2"><Checkbox checked={selectedIds.includes(record.id)} onCheckedChange={(checked) => toggleRow(record.id, checked === true)} aria-label="Select row" /></td>\n` +
    columns
      .map(
        (field) =>
          `{#if visible.${field.name}}${
            ["string", "text", "json", "date", "datetime"].includes(field.type)
              ? `        <td class="max-w-0 px-3 py-2 ${alignmentFor(field.type)}"><TruncatedCell value={${field.type === "date" || field.type === "datetime" ? `formatDisplayDate(record.${field.name}, ${field.type === "datetime"})` : `record.${field.name}`}} /></td>`
              : `        <td class="px-3 py-2 ${alignmentFor(field.type)}">{record.${field.name}}</td>`
          }{/if}`,
      )
      .join("\n") +
    (attachmentCells ? `\n${attachmentCells}` : "");
  const headings =
    `        <th class="w-0 px-3 py-2"><Checkbox checked={allSelected} indeterminate={someSelected} onCheckedChange={(checked) => toggleAll(checked === true)} aria-label="Select all rows" /></th>\n` +
    columns
      .map(
        (field) =>
          `{#if visible.${field.name}}        <ResizableHead resource="${kebab(table)}" column="${field.name}" class="px-3 py-2 ${alignmentFor(field.type)}"><button class="inline-flex items-center gap-1 font-medium" onclick={() => toggleSort('${field.name}')}>${humanize(field.name)}<span class="text-xs">{sortField === '${field.name}' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}</span></button></ResizableHead>{/if}`,
      )
      .join("\n") +
    (attachmentHeadings ? `\n${attachmentHeadings}` : "");
  const source = `<script lang="ts">\n  import { onMount } from 'svelte'\n  import { treaty } from '@elysiajs/eden'\n  import type { App } from '../../../../src/app'\n  import type { ${model} } from '../../../../src/db/schema/${file}'\n\n  const api = treaty<App>('http://localhost:3000')\n  let records = $state<${model}[]>([])\n  let form = $state({ ${defaults} })\n  let editing = $state<number | null>(null)\n  let message = $state('')\n\n  async function load() {\n    const { data, error } = await api.${table}.get()\n    if (error) message = 'Could not load ${table}'\n    else records = data ?? []\n  }\n\n  async function save(event: SubmitEvent) {\n    event.preventDefault()\n    const result = editing === null\n      ? await api.${table}.post(form)\n      : await api.${table}({ id: editing }).patch(form)\n    if (result.error) message = 'Could not save ${singular}'\n    else { cancel(); await load() }\n  }\n\n  function edit(record: ${model}) {\n    editing = record.id\n    form = { ${fields.map((field) => `${field.name}: record.${field.name}`).join(", ")} }\n  }\n\n  function cancel() { editing = null; form = { ${defaults} }; message = '' }\n\n  async function remove(id: number) {\n    const { error } = await api.${table}({ id }).delete()\n    if (error) message = 'Could not delete ${singular}'\n    else await load()\n  }\n\n  onMount(load)\n</script>\n\n<svelte:head><title>${model}s</title></svelte:head>\n\n<main class="mx-auto max-w-4xl px-6 py-16">\n  <h1 class="text-4xl font-bold">${model}s</h1>\n  <form class="mt-8 grid gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm" onsubmit={save}>\n${controls}\n    <div class="flex gap-2">\n      <button class="rounded-md bg-zinc-900 px-4 py-2 text-white" type="submit">{editing === null ? 'Create' : 'Update'}</button>\n      {#if editing !== null}<button class="rounded-md border px-4 py-2" type="button" onclick={cancel}>Cancel</button>{/if}\n    </div>\n  </form>\n  {#if message}<p class="mt-4 text-red-700">{message}</p>{/if}\n  <div class="mt-8 overflow-x-auto rounded-lg border bg-white">\n    <table class="w-full">\n      <thead><tr>\n${headings}\n        <th class="px-3 py-2">Actions</th>\n      </tr></thead>\n      <tbody>{#each records as record (record.id)}<tr class="border-t">\n${cells}\n        <td class="flex gap-2 px-3 py-2"><button onclick={() => edit(record)}>Edit</button><button class="text-red-700" onclick={() => remove(record.id)}>Delete</button></td>\n      </tr>{/each}</tbody>\n    </table>\n  </div>\n</main>\n`;
  const attachmentType = attachments
    .flatMap((field) => [
      `${field.name}${field.attachment!.multiple ? "Attachments" : "Attachment"}: ${field.attachment!.multiple ? "AttachmentItem[]" : "AttachmentItem | null"}`,
      `${field.name}${field.attachment!.multiple ? "Urls" : "Url"}: ${field.attachment!.multiple ? "string[]" : "string | null"}`,
    ])
    .join("; ");
  const removalFunctions = attachments
    .map(
      (field) =>
        `  async function remove${field.name[0]!.toUpperCase() + field.name.slice(1)}(recordId: number, blobId: number) {\n    const response = await fetch(\`http://localhost:3000/${kebab(table)}/\${recordId}/${kebab(field.name)}${field.attachment!.multiple ? "/${blobId}" : ""}\`, { method: 'DELETE' })\n    if (response.ok) await load(); else message = 'Could not remove ${field.name}'\n  }`,
    )
    .join("\n");
  const attachmentUiSource = attachments.length
    ? source
        .replace(
          "  import { onMount } from 'svelte'",
          "  import { onMount } from 'svelte'\n  import AttachmentBadge from '$lib/components/attachment-badge.svelte'",
        )
        .replace(
          `  let records = $state<${model}[]>([])`,
          `  type AttachmentItem = { id: number; filename: string; contentType: string; byteSize: number; url: string }\n  type ${model}Record = ${model} & { ${attachmentType} }\n  let records = $state<${model}Record[]>([])`,
        )
        .replace("  onMount(load)", `${removalFunctions}\n  onMount(load)`)
    : source;
  await ensureNew(
    join(cwd, "web", "src", "routes", kebab(table), "+page.svelte"),
    modernizeIndex(attachmentUiSource, model, table, actions, fields),
  );
  if (actions.includes("show"))
    await generateDetailsUi(raw, allFields, cwd, actions);
}

async function generateReferenceResourceUi(
  raw: string,
  fields: ReturnType<typeof parseFields>,
  cwd: string,
  actions: string[],
) {
  await ensureScaffoldComponents(cwd);
  const { singular, table, file } = names(raw);
  const model = singular[0]!.toUpperCase() + singular.slice(1);
  const references = await Promise.all(
    fields
      .filter((field) => field.reference)
      .map(async (field) => {
        const relation = field.reference!.relation;
        const schema = await Bun.file(
          join(cwd, "src", "db", "schema", `${field.reference!.file}.ts`),
        ).text();
        const label = /^\s*(name|title):\s*text\(/m.exec(schema)?.[1] ?? "id";
        return {
          field,
          relation,
          label,
          relatedModel: relation[0]!.toUpperCase() + relation.slice(1),
        };
      }),
  );
  const collections = await Promise.all(
    fields
      .filter((field) => field.collection)
      .map(async (field) => {
        const relation = field.collection!.relation;
        const schema = await Bun.file(
          join(cwd, "src", "db", "schema", `${field.collection!.file}.ts`),
        ).text();
        const label = /^\s*(name|title):\s*text\(/m.exec(schema)?.[1] ?? "id";
        const singularRelation = relation.endsWith("s")
          ? relation.slice(0, -1)
          : relation;
        return {
          field,
          relation,
          label,
          relatedModel:
            singularRelation[0]!.toUpperCase() + singularRelation.slice(1),
        };
      }),
  );
  const columns = fields.filter(
    (field) => !field.collection && !field.attachment,
  );
  const editableFields = fields.filter((field) => !field.generated);
  const editableColumns = columns.filter((field) => !field.generated);
  const attachments = fields.filter((field) => field.attachment);
  const defaults = [...editableColumns, ...attachments]
    .map(
      (field) =>
        `${field.name}: ${field.attachment ? `undefined as ${field.attachment.multiple ? "File[]" : "File"} | undefined` : field.type === "boolean" ? "false" : field.reference ? (field.reference.idType === "uuid" ? "''" : "0") : ["smallint", "integer", "bigint", "real", "float"].includes(field.type) ? "0" : "''"}`,
    )
    .join(", ");
  const imports = [
    `  import RelationshipCombobox from '$lib/components/relationship-combobox.svelte'`,
    `  import RelationshipMultiCombobox from '$lib/components/relationship-multi-combobox.svelte'`,
    ...[...references, ...collections].map(
      (reference) =>
        `  import type { ${reference.relatedModel} } from '../../../../src/db/schema/${reference.field.reference?.file ?? reference.field.collection!.file}'`,
    ),
  ].join("\n");
  const state = [...references, ...collections]
    .map((reference) => {
      return `  let ${reference.relation}Options = $state<${reference.relatedModel}[]>([])\n  let ${reference.relation}Items = $derived(${reference.relation}Options.map(option => ({ id: option.id, label: label(option) })))`;
    })
    .concat(
      collections.map(
        (reference) =>
          `  let ${reference.relation}Selected = $state<${reference.relatedModel}['id'][]>([])`,
      ),
    )
    .join("\n");
  const loads = [...references, ...collections]
    .map(
      (reference) =>
        `    const ${reference.relation}Result = await api.${reference.field.reference?.table ?? reference.field.collection!.table}.get({ query: { perPage: 'all' } })\n    if (!${reference.relation}Result.error) ${reference.relation}Options = ${reference.relation}Result.data?.records ?? []`,
    )
    .join("\n");
  const creators = [...references, ...collections]
    .filter((reference) => reference.label !== "id")
    .map((reference) => {
      return `  async function create${reference.relatedModel}(value: string) {\n    const result = await api.${reference.field.reference?.table ?? reference.field.collection!.table}.post({ ${reference.label}: value })\n    if (result.error || !result.data) { message = errorMessage(result.error, 'Could not create ${reference.relation}'); return null }\n    ${reference.relation}Options = [...${reference.relation}Options, result.data]\n    return { id: result.data.id, label: label(result.data) }\n  }`;
    })
    .join("\n\n");
  const controls = editableFields
    .map((field) => {
      if (field.attachment)
        return `    <label class="grid gap-1"><span class="text-sm font-medium">${field.name}</span><input type="file"${field.attachment.multiple ? " multiple" : ""}${field.attachment.accept ? ` accept="${field.attachment.accept}"` : ""} onchange={(event) => { const files = event.currentTarget.files; form.${field.name} = ${field.attachment.multiple ? "files ? Array.from(files) : []" : "files?.[0]"} }} /></label>`;
      if (field.collection) {
        const collection = collections.find(
          (item) => item.field.name === field.name,
        )!;
        const create =
          collection.label === "id"
            ? ""
            : ` oncreate={create${collection.relatedModel}}`;
        return `    <RelationshipMultiCombobox label="${collection.relatedModel}s" items={${collection.relation}Items} bind:values={${collection.relation}Selected}${create} />`;
      }
      if (field.type === "boolean")
        return `    <label class="flex items-center justify-between gap-4 rounded-md border p-3"><span class="text-sm font-medium capitalize">${field.name}</span><span class="flex items-center gap-2"><Switch bind:checked={form.${field.name}} /><span class="w-8 text-xs font-semibold">{form.${field.name} ? 'ON' : 'OFF'}</span></span></label>`;
      if (
        ["date", "time", "datetime", "timestamp", "timestamptz"].includes(
          field.type,
        )
      )
        return `    <DateField label="${field.name}" type="${field.type === "date" || field.type === "time" ? field.type : "datetime"}" bind:value={form.${field.name}} />`;
      if (field.reference) {
        const reference = references.find(
          (item) => item.field.name === field.name,
        )!;
        const create =
          reference.label === "id"
            ? ""
            : ` oncreate={create${reference.relatedModel}}`;
        return `    <RelationshipCombobox label="${reference.relatedModel}" items={${reference.relation}Items} bind:value={form.${field.name}}${create} />`;
      }
      const inputType =
        field.type === "integer" || field.type === "float" ? "number" : "text";
      return `    <label class="grid gap-1"><span class="text-sm font-medium capitalize">${field.name}</span><input class="rounded-md border border-zinc-300 px-3 py-2" type="${inputType}" bind:value={form.${field.name}} required /></label>`;
    })
    .join("\n");
  const attachmentHeadings = attachments
    .map(
      (field) =>
        `        <ResizableHead resource="${kebab(table)}" column="${field.name}" class="px-3 py-2 text-center">${humanize(field.name)}</ResizableHead>`,
    )
    .join("\n");
  const attachmentCells = attachments
    .map(
      (field) =>
        `        <td class="w-0 px-3 py-2 text-center"><AttachmentBadge label="${humanize(field.name)}" items={${field.attachment!.multiple ? `record.${field.name}Attachments` : `record.${field.name}Attachment ? [record.${field.name}Attachment] : []`}} onremove={(blobId) => remove${field.name[0]!.toUpperCase() + field.name.slice(1)}(record.id, blobId)} /></td>`,
    )
    .join("\n");
  const collectionHeadings = collections
    .map(
      (collection) =>
        `        <th class="w-0 whitespace-nowrap px-3 py-2 text-center">${humanize(collection.relation)}</th>`,
    )
    .join("\n");
  const collectionCells = collections
    .map(
      (collection) =>
        `        <td class="w-0 px-3 py-2 text-center">${actions.includes("show") ? `<a class="inline-flex min-w-7 items-center justify-center rounded-full bg-muted px-2 py-1 text-xs font-semibold hover:bg-muted/70" href={\`/${kebab(table)}/\${record.id}\`}>{record.${collection.relation}Ids.length}</a>` : `<span class="inline-flex min-w-7 items-center justify-center rounded-full bg-muted px-2 py-1 text-xs font-semibold">{record.${collection.relation}Ids.length}</span>`}</td>`,
    )
    .join("\n");
  const headings =
    `        <th class="w-0 px-3 py-2"><Checkbox checked={allSelected} indeterminate={someSelected} onCheckedChange={(checked) => toggleAll(checked === true)} aria-label="Select all rows" /></th>\n` +
    columns
      .map(
        (field) =>
          `{#if visible.${field.name}}        <ResizableHead resource="${kebab(table)}" column="${field.name}" class="px-3 py-2 ${field.reference ? "text-left" : alignmentFor(field.type)}"><button class="inline-flex items-center gap-1 font-medium" onclick={() => toggleSort('${field.name}')}>${humanize(field.reference?.relation ?? field.name)}<span class="text-xs">{sortField === '${field.name}' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}</span></button></ResizableHead>{/if}`,
      )
      .join("\n") +
    (collectionHeadings ? `\n${collectionHeadings}` : "") +
    (attachmentHeadings ? `\n${attachmentHeadings}` : "");
  const associationSaves = collections
    .map(
      (collection) =>
        `api.${table}({ id: result.data.id }).${collection.relation}.put({ ids: ${collection.relation}Selected })`,
    )
    .join(", ");
  const associationLoads = collections
    .map(
      (collection) =>
        `const ${collection.relation}Result = await api.${table}({ id: record.id }).${collection.relation}.get(); if (!${collection.relation}Result.error) ${collection.relation}Selected = ${collection.relation}Result.data ?? []`,
    )
    .join("; ");
  const associationResets = collections
    .map((collection) => `${collection.relation}Selected = []`)
    .join("; ");
  const dataCells = columns
    .map((field) => {
      if (!field.reference)
        return ["string", "text", "json", "date", "datetime"].includes(
          field.type,
        )
          ? `{#if visible.${field.name}}        <td class="max-w-0 px-3 py-2 ${alignmentFor(field.type)}"><TruncatedCell value={${field.type === "date" || field.type === "datetime" ? `formatDisplayDate(record.${field.name}, ${field.type === "datetime"})` : `record.${field.name}`}} /></td>{/if}`
          : `{#if visible.${field.name}}        <td class="px-3 py-2 ${alignmentFor(field.type)}">{record.${field.name}}</td>{/if}`;
      const reference = references.find(
        (item) => item.field.name === field.name,
      )!;
      return `{#if visible.${field.name}}        <td class="max-w-0 px-3 py-2 text-left"><a class="font-medium text-primary hover:underline" href={\`/${kebab(reference.field.reference!.table)}/\${record.${field.name}}\`}>{label(${reference.relation}Options.find(option => option.id === record.${field.name}) ?? { id: record.${field.name} })}</a></td>{/if}`;
    })
    .join("\n");
  const cells = `        <td class="w-0 px-3 py-2"><Checkbox checked={selectedIds.includes(record.id)} onCheckedChange={(checked) => toggleRow(record.id, checked === true)} aria-label="Select row" /></td>\n${dataCells}${collectionCells ? `\n${collectionCells}` : ""}${attachmentCells ? `\n${attachmentCells}` : ""}`;
  const source = `<script lang="ts">\n  import { onMount } from 'svelte'\n  import { treaty } from '@elysiajs/eden'\n  import type { App } from '../../../../src/app'\n  import type { ${model} } from '../../../../src/db/schema/${file}'\n${imports}\n\n  const api = treaty<App>('http://localhost:3000')\n  let records = $state<${model}[]>([])\n  let form = $state({ ${defaults} })\n  let editing = $state<number | null>(null)\n  let message = $state('')\n${state}\n\n  function label(record: unknown) { const value = record as { id: number; name?: unknown; title?: unknown }; return String(value.name ?? value.title ?? value.id) }\n  function errorMessage(error: unknown, fallback: string) { if (error && typeof error === 'object' && 'value' in error) return String((error as { value: unknown }).value); return fallback }\n\n  async function load() {\n    const result = await api.${table}.get()\n    if (result.error) message = errorMessage(result.error, 'Could not load ${table}')\n    else records = result.data ?? []\n${loads}\n  }\n\n${creators}\n\n  async function save(event: SubmitEvent) {\n    event.preventDefault()\n    const result = editing === null ? await api.${table}.post(form) : await api.${table}({ id: editing }).patch(form)\n    if (result.error || !result.data) message = errorMessage(result.error, 'Could not save ${singular}')\n    else { ${associationSaves ? `await Promise.all([${associationSaves}]); ` : ""}cancel(); await load() }\n  }\n\n  async function edit(record: ${model}) { editing = record.id; form = { ${columns.map((field) => `${field.name}: record.${field.name}`).join(", ")} }; ${associationLoads} }\n  function cancel() { editing = null; form = { ${defaults} }; ${associationResets ? `${associationResets}; ` : ""}message = '' }\n  async function remove(id: number) { const result = await api.${table}({ id }).delete(); if (result.error) message = errorMessage(result.error, 'Could not delete ${singular}'); else await load() }\n  onMount(load)\n</script>\n\n<svelte:head><title>${model}s</title></svelte:head>\n<main class="mx-auto max-w-5xl px-6 py-16">\n  <div><p class="text-sm font-medium uppercase tracking-widest text-zinc-500">Scaffold</p><h1 class="mt-2 text-4xl font-bold">${model}s</h1></div>\n  <form class="mt-8 grid gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm" onsubmit={save}>\n${controls}\n    <div class="flex gap-2"><button class="rounded-md bg-zinc-900 px-4 py-2 text-white" type="submit">{editing === null ? 'Create' : 'Update'}</button>{#if editing !== null}<button class="rounded-md border px-4 py-2" type="button" onclick={cancel}>Cancel</button>{/if}</div>\n  </form>\n  {#if message}<p class="mt-4 rounded-md bg-red-50 p-3 text-red-700">{message}</p>{/if}\n  <div class="mt-8 overflow-x-auto rounded-xl border bg-white"><table class="w-full"><thead><tr>\n${headings}\n        <th class="px-3 py-2">Actions</th></tr></thead><tbody>{#each records as record (record.id)}<tr class="border-t">\n${cells}\n        <td class="flex gap-3 px-3 py-2"><button onclick={() => edit(record)}>Edit</button><button class="text-red-700" onclick={() => remove(record.id)}>Delete</button></td></tr>{/each}</tbody></table></div>\n</main>\n`;
  const attachmentEditValues = attachments
    .map((field) => `${field.name}: undefined`)
    .join(", ");
  const pageSource = attachmentEditValues
    ? source.replace(
        `form = { ${columns.map((field) => `${field.name}: record.${field.name}`).join(", ")} }`,
        `form = { ${columns.map((field) => `${field.name}: record.${field.name}`).join(", ")}, ${attachmentEditValues} }`,
      )
    : source;
  const attachmentType = attachments
    .flatMap((field) => [
      `${field.name}${field.attachment!.multiple ? "Attachments" : "Attachment"}: ${field.attachment!.multiple ? "AttachmentItem[]" : "AttachmentItem | null"}`,
      `${field.name}${field.attachment!.multiple ? "Urls" : "Url"}: ${field.attachment!.multiple ? "string[]" : "string | null"}`,
    ])
    .join("; ");
  const removalFunctions = attachments
    .map(
      (field) =>
        `  async function remove${field.name[0]!.toUpperCase() + field.name.slice(1)}(recordId: number, blobId: number) {\n    const response = await fetch(\`http://localhost:3000/${kebab(table)}/\${recordId}/${kebab(field.name)}${field.attachment!.multiple ? "/${blobId}" : ""}\`, { method: 'DELETE' })\n    if (response.ok) await load(); else message = 'Could not remove ${field.name}'\n  }`,
    )
    .join("\n");
  const extraRecordType = [
    attachmentType,
    ...collections.map(
      (collection) =>
        `${collection.relation}Ids: ${collection.relatedModel}['id'][]`,
    ),
  ]
    .filter(Boolean)
    .join("; ");
  const enrichedPageSource = extraRecordType
    ? pageSource
        .replace(
          "  import { onMount } from 'svelte'",
          `  import { onMount } from 'svelte'${attachments.length ? "\n  import AttachmentBadge from '$lib/components/attachment-badge.svelte'" : ""}`,
        )
        .replace(
          `  let records = $state<${model}[]>([])`,
          `${attachments.length ? "  type AttachmentItem = { id: number; filename: string; contentType: string; byteSize: number; url: string }\n" : ""}  type ${model}Record = ${model} & { ${extraRecordType} }\n  let records = $state<${model}Record[]>([])`,
        )
        .replace("  onMount(load)", `${removalFunctions}\n  onMount(load)`)
    : pageSource;
  await ensureNew(
    join(cwd, "web", "src", "routes", kebab(table), "+page.svelte"),
    modernizeIndex(enrichedPageSource, model, table, actions, fields),
  );
  if (actions.includes("show"))
    await generateDetailsUi(raw, fields, cwd, actions);
}

async function ensureScaffoldComponents(cwd: string) {
  for (const file of [
    "attachment-badge.svelte",
    "detail-edit-dialog.svelte",
    "resizable-head.svelte",
    "relationship-combobox.svelte",
    "relationship-multi-combobox.svelte",
    "icon-action.svelte",
    "row-actions.svelte",
    "date-field.svelte",
    "theme-toggle.svelte",
    "truncated-cell.svelte",
  ]) {
    const target = join(cwd, "web", "src", "lib", "components", file);
    if (await Bun.file(target).exists()) continue;
    await Bun.write(
      target,
      Bun.file(
        join(
          import.meta.dir,
          "..",
          "template",
          "web",
          "src",
          "lib",
          "components",
          file,
        ),
      ),
    );
    console.log(`create ${target}`);
  }
}

function modernizeIndex(
  source: string,
  model: string,
  table: string,
  actions: string[],
  fields: ReturnType<typeof parseFields>,
) {
  const columns = fields.filter(
    (field) => !field.collection && !field.attachment,
  );
  const visible = columns.map((field) => `${field.name}: true`).join(", ");
  const defaultSort = columns.some((field) => field.name === "position")
    ? "position"
    : "id";
  const hasPosition = columns.some((field) => field.name === "position");
  const rowActions = `<RowActions label="${model}"${actions.includes("show") ? ` href={\`/${kebab(table)}/\${record.id}\`}` : ""}${actions.includes("update") ? " onedit={() => { edit(record); dialogOpen = true }}" : ""}${actions.includes("destroy") ? " ondelete={() => remove(record.id)}" : ""} />`;
  const button = actions.includes("create")
    ? `<Button type="button" onclick={openNew}>New ${model}</Button>`
    : "";
  const columnItems = columns
    .map(
      (field) =>
        `<DropdownMenu.CheckboxItem checked={visible.${field.name}} onCheckedChange={(checked) => setColumn('${field.name}', checked === true)} class="capitalize">${field.reference?.relation ?? field.name}</DropdownMenu.CheckboxItem>`,
    )
    .join("");
  const dragFunctions = hasPosition
    ? `\n  let draggedId = $state<number | null>(null)\n  async function dropRow(targetId: number) {\n    if (draggedId === null || draggedId === targetId) return\n    const next = [...records]\n    const from = next.findIndex(record => record.id === draggedId)\n    const to = next.findIndex(record => record.id === targetId)\n    const [moved] = next.splice(from, 1)\n    if (!moved) return\n    next.splice(to, 0, moved)\n    records = next\n    draggedId = null\n    const positions = next.map(record => record.position).sort((left, right) => left - right)\n    await Promise.all(next.map((record, index) => api.${table}({ id: record.id }).patch({ position: positions[index]! })))\n    await load()\n  }`
    : "";
  const rowDrag = hasPosition
    ? " draggable={sortField === 'position' && sortOrder === 'asc'} ondragstart={() => draggedId = record.id} ondragover={(event) => event.preventDefault()} ondrop={() => dropRow(record.id)}"
    : "";
  const dateTimeImport = fields.some(
    (field) => field.type === "date" || field.type === "datetime",
  )
    ? "\n  import { formatDisplayDate } from '$lib/date-time.svelte.js'"
    : "";
  const initialize = "  async function initialize() { await load() }";
  return source
    .replaceAll(
      "$state<number | null>(null)",
      `$state<${model}['id'] | null>(null)`,
    )
    .replaceAll("recordId: number", `recordId: ${model}['id']`)
    .replaceAll("remove(id: number)", `remove(id: ${model}['id'])`)
    .replaceAll(
      "id: number; name?: unknown",
      "id: string | number; name?: unknown",
    )
    .replaceAll("$state<number[]>([])", `$state<${model}['id'][]>([])`)
    .replaceAll("toggleRow(id: number", `toggleRow(id: ${model}['id']`)
    .replaceAll(
      "draggedId = $state<number | null>",
      `draggedId = $state<${model}['id'] | null>`,
    )
    .replaceAll(
      "dropRow(targetId: number)",
      `dropRow(targetId: ${model}['id'])`,
    )
    .replace(
      "  import { treaty } from '@elysiajs/eden'",
      "  import { treaty } from '@elysiajs/eden'\n  import { Button } from '$lib/components/ui/button/index.js'\n  import { Checkbox } from '$lib/components/ui/checkbox/index.js'\n  import * as Dialog from '$lib/components/ui/dialog/index.js'\n  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'\n  import { Input } from '$lib/components/ui/input/index.js'\n  import * as Select from '$lib/components/ui/select/index.js'\n  import { Switch } from '$lib/components/ui/switch/index.js'\n  import * as Table from '$lib/components/ui/table/index.js'\n  import DateField from '$lib/components/date-field.svelte'\n  import RowActions from '$lib/components/row-actions.svelte'\n  import TruncatedCell from '$lib/components/truncated-cell.svelte'",
    )
    .replace(
      "  let message = $state('')",
      `  let message = $state('')\n  let total = $state(0)\n  let page = $state(1)\n  let perPage = $state('50')\n  let filter = $state('')\n  let filterTimer: ReturnType<typeof setTimeout>\n  let sortField = $state('${defaultSort}')\n  let sortOrder = $state<'asc' | 'desc'>('asc')\n  let visible = $state({ ${visible} })\n  let selectedIds = $state<number[]>([])\n  let allSelected = $derived(records.length > 0 && records.every(record => selectedIds.includes(record.id)))\n  let someSelected = $derived(!allSelected && records.some(record => selectedIds.includes(record.id)))\n  let pageCount = $derived(perPage === 'all' ? 1 : Math.max(1, Math.ceil(total / Number(perPage))))\n  let dialogOpen = $state(false)${dragFunctions}`,
    )
    .replace(
      `api.${table}.get()`,
      `api.${table}.get({ query: { page: String(page), perPage, filter: filter || undefined, sort: sortField, order: sortOrder } })`,
    )
    .replace(
      "  import type { App }",
      `  import ResizableHead from '$lib/components/resizable-head.svelte'${dateTimeImport}\n  import type { App }`,
    )
    .replace(
      "else records = data ?? []",
      "else { records = data?.records ?? []; total = data?.total ?? 0 }",
    )
    .replace(
      "else records = result.data ?? []",
      "else { records = result.data?.records ?? []; total = result.data?.total ?? 0 }",
    )
    .replace(
      "  onMount(load)",
      "  function scheduleFilter() { clearTimeout(filterTimer); filterTimer = setTimeout(async () => { page = 1; await load() }, 250) }\n  async function toggleSort(field: string) { sortOrder = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc'; sortField = field; page = 1; await load() }\n  function setColumn(field: string, shown: boolean) { visible = { ...visible, [field]: shown } }\n  function toggleRow(id: number, checked: boolean) { selectedIds = checked ? [...new Set([...selectedIds, id])] : selectedIds.filter(value => value !== id) }\n  function toggleAll(checked: boolean) { const ids = records.map(record => record.id); selectedIds = checked ? [...new Set([...selectedIds, ...ids])] : selectedIds.filter(id => !ids.includes(id)) }\n  async function changePageSize(value: string | undefined) { if (!value) return; perPage = value; page = 1; await load() }\n  async function previousPage() { if (page > 1) { page -= 1; await load() } }\n  async function nextPage() { if (page < pageCount) { page += 1; await load() } }\n  onMount(load)",
    )
    .replace("  onMount(load)", `${initialize}\n  onMount(initialize)`)
    .replace(
      "  function cancel() { editing = null;",
      "  function openNew() { cancel(); dialogOpen = true }\n  function cancel() { dialogOpen = false; editing = null;",
    )
    .replace(
      `<div><p class="text-sm font-medium uppercase tracking-widest text-zinc-500">Scaffold</p><h1 class="mt-2 text-4xl font-bold">${model}s</h1></div>`,
      `<div class="flex items-end justify-between gap-4"><div><p class="text-sm font-medium uppercase tracking-widest text-zinc-500">Scaffold</p><h1 class="mt-2 text-4xl font-bold">${model}s</h1></div>${button}</div>`,
    )
    .replace(
      `<h1 class="text-4xl font-bold">${model}s</h1>`,
      `<div class="flex items-end justify-between gap-4"><h1 class="text-4xl font-bold">${model}s</h1>${button}</div>`,
    )
    .replace(
      '  <form class="mt-8 grid gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm" onsubmit={save}>',
      `  <Dialog.Root bind:open={dialogOpen}><Dialog.Content class="sm:max-w-xl"><Dialog.Header><Dialog.Title>{editing === null ? 'New' : 'Edit'} ${model}</Dialog.Title><Dialog.Description>Enter the ${model.toLowerCase()} details below.</Dialog.Description></Dialog.Header><form class="grid gap-4" onsubmit={save}>`,
    )
    .replace(
      '  <form class="mt-8 grid gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm" onsubmit={save}>',
      `  <Dialog.Root bind:open={dialogOpen}><Dialog.Content class="sm:max-w-xl"><Dialog.Header><Dialog.Title>{editing === null ? 'New' : 'Edit'} ${model}</Dialog.Title><Dialog.Description>Enter the ${model.toLowerCase()} details below.</Dialog.Description></Dialog.Header><form class="grid gap-4" onsubmit={save}>`,
    )
    .replace(
      "  </form>\n  {#if message}",
      "  </form></Dialog.Content></Dialog.Root>\n  {#if message}",
    )
    .replace(
      /<td class="flex gap-3 px-3 py-2"><button onclick=\{\(\) => edit\(record\)\}>Edit<\/button><button class="text-red-700" onclick=\{\(\) => remove\(record.id\)\}>Delete<\/button><\/td>/,
      `<td class="w-0 whitespace-nowrap px-3 py-2 text-center">${rowActions}</td>`,
    )
    .replace(
      /<td class="flex gap-2 px-3 py-2"><button onclick=\{\(\) => edit\(record\)\}>Edit<\/button><button class="text-red-700" onclick=\{\(\) => remove\(record.id\)\}>Delete<\/button><\/td>/,
      `<td class="w-0 whitespace-nowrap px-3 py-2 text-center">${rowActions}</td>`,
    )
    .replace(
      '<th class="px-3 py-2">Actions</th>',
      '<th class="w-0 whitespace-nowrap px-3 py-2 text-center">Actions</th>',
    )
    .replace(
      /<div class="mt-8 overflow-x-auto rounded-(lg|xl) border bg-white">/,
      `<div class="mt-6 flex flex-wrap items-center gap-2"><Input class="max-w-sm" placeholder="Filter ${model.toLowerCase()}s…" bind:value={filter} oninput={scheduleFilter} /><DropdownMenu.Root><DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} variant="outline" class="ml-auto">Columns</Button>{/snippet}</DropdownMenu.Trigger><DropdownMenu.Content align="end"><DropdownMenu.Label>Show columns</DropdownMenu.Label>${columnItems}</DropdownMenu.Content></DropdownMenu.Root></div><div class="mt-4 rounded-$1 border bg-card text-card-foreground">`,
    )
    .replace(
      /overflow-x-auto rounded-(lg|xl) border bg-white/g,
      "rounded-$1 border bg-card text-card-foreground",
    )
    .replace(
      /<table class="w-full">/g,
      '<Table.Root class="w-max min-w-full table-fixed">',
    )
    .replace(/<\/table>/g, "</Table.Root>")
    .replace(/<thead>/g, "<Table.Header>")
    .replace(/<\/thead>/g, "</Table.Header>")
    .replace(/<tbody>/g, "<Table.Body>")
    .replace(/<\/tbody>/g, "</Table.Body>")
    .replace(
      '<tr class="border-t">',
      `<tr class="border-t"${rowDrag} data-state={selectedIds.includes(record.id) ? 'selected' : undefined}>`,
    )
    .replace(/<tr([^>]*)>/g, "<Table.Row$1>")
    .replace(/<\/tr>/g, "</Table.Row>")
    .replace(/<th([^>]*)>/g, "<Table.Head$1>")
    .replace(/<\/th>/g, "</Table.Head>")
    .replace(/<td([^>]*)>/g, "<Table.Cell$1>")
    .replace(/<\/td>/g, "</Table.Cell>")
    .replace(
      /<main class="mx-auto max-w-(4xl|5xl) px-6 py-16">/,
      '<main class="w-full min-w-0 px-4 py-8 sm:px-6 lg:px-8">',
    )
    .replace(
      /<\/Table.Root>\s*<\/div>\s*<\/main>/,
      `</Table.Root></div>\n  <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span>{selectedIds.length} of {total} selected · {total} {total === 1 ? 'record' : 'records'}</span><div class="flex items-center gap-2"><span>Rows</span><Select.Root type="single" value={perPage} onValueChange={changePageSize}><Select.Trigger class="w-24">{perPage === 'all' ? 'All' : perPage}</Select.Trigger><Select.Content><Select.Item value="50">50</Select.Item><Select.Item value="100">100</Select.Item><Select.Item value="250">250</Select.Item><Select.Item value="all">All</Select.Item></Select.Content></Select.Root>{#if perPage !== 'all' && pageCount > 1}<Button variant="outline" size="sm" disabled={page <= 1} onclick={previousPage}>Previous</Button><span>Page {page} of {pageCount}</span><Button variant="outline" size="sm" disabled={page >= pageCount} onclick={nextPage}>Next</Button>{/if}</div></div>\n</main>`,
    )
    .replaceAll(`${model}s`, humanize(table))
    .replaceAll(`${model.toLowerCase()}s`, humanize(table).toLowerCase())
    .replaceAll("$state<number[]>([])", `$state<${model}['id'][]>([])`)
    .replaceAll("toggleRow(id: number", `toggleRow(id: ${model}['id']`)
    .replaceAll(
      "$state<number | null>(null)",
      `$state<${model}['id'] | null>(null)`,
    )
    .replaceAll(
      "dropRow(targetId: number)",
      `dropRow(targetId: ${model}['id'])`,
    );
}

async function generateDetailsUi(
  raw: string,
  fields: ReturnType<typeof parseFields>,
  cwd: string,
  actions: string[],
) {
  const { singular, table } = names(raw);
  const model = singular[0]!.toUpperCase() + singular.slice(1);
  const attachments = fields.filter((field) => field.attachment);
  const collections = fields.filter((field) => field.collection);
  const rows = fields
    .map((field) =>
      field.attachment
        ? `      <div class="grid gap-1 border-b border-zinc-100 py-4 sm:grid-cols-[12rem_1fr]"><dt class="text-sm font-medium capitalize text-zinc-500">${field.name}</dt><dd>${field.attachment.multiple ? `{#each record.${field.name}Urls ?? [] as url}<img class="mb-3 max-h-80 rounded-md object-contain" src={url} alt="${field.name}" />{/each}` : `{#if record.${field.name}Url}<img class="max-h-80 rounded-md object-contain" src={record.${field.name}Url} alt="${field.name}" />{/if}`}</dd></div>`
        : field.collection
          ? `      <div class="grid gap-1 border-b border-zinc-100 py-4 sm:grid-cols-[12rem_1fr]"><dt class="text-sm font-medium capitalize text-zinc-500">${field.collection.relation}</dt><dd class="flex flex-wrap gap-2">{#each record.${field.collection.relation}Ids as relatedId}<a class="font-medium text-primary hover:underline" href={\`/${kebab(field.collection.table)}/\${relatedId}\`}>{relatedId}</a>{:else}<span class="text-zinc-500">None</span>{/each}</dd></div>`
          : field.reference
            ? `      <div class="grid gap-1 border-b border-zinc-100 py-4 sm:grid-cols-[12rem_1fr]"><dt class="text-sm font-medium capitalize text-zinc-500">${field.reference.relation}</dt><dd><a class="font-medium text-primary hover:underline" href={\`/${kebab(field.reference.table)}/\${record.${field.name}}\`}>{record.${field.name}}</a></dd></div>`
            : `      <div class="grid gap-1 border-b border-zinc-100 py-4 sm:grid-cols-[12rem_1fr]"><dt class="text-sm font-medium capitalize text-zinc-500">${field.name}</dt><dd>{${field.type === "date" || field.type === "datetime" ? `formatDisplayDate(record.${field.name}, ${field.type === "datetime"})` : `record.${field.name}`}}</dd></div>`,
    )
    .join("\n");
  const dateTimeImport = fields.some(
    (field) => field.type === "date" || field.type === "datetime",
  )
    ? "  import { formatDisplayDate } from '$lib/date-time.svelte.js'\n"
    : "";
  const editableFields = fields.filter((field) => !field.generated);
  const editFields = editableFields
    .map((field) => {
      const key = field.collection
        ? `${field.collection.relation}Ids`
        : field.name;
      const kind = field.collection
        ? "ids"
        : field.attachment
          ? "file"
          : field.type === "boolean"
            ? "boolean"
            : [
                  "smallint",
                  "integer",
                  "bigint",
                  "real",
                  "float",
                  "decimal",
                ].includes(field.type)
              ? "number"
              : field.type === "date"
                ? "date"
                : field.type === "time"
                  ? "time"
                  : ["datetime", "timestamp", "timestamptz"].includes(
                        field.type,
                      )
                    ? "datetime"
                    : "text";
      return `{ key: '${key}', label: '${humanize(field.collection?.relation ?? field.reference?.relation ?? field.name)}', kind: '${kind}'${field.collection ? `, relation: '${kebab(field.collection.relation)}', idKind: '${field.collection.idType === "uuid" ? "string" : "number"}'` : ""} }`;
    })
    .join(", ");
  const hasUpdate = actions.includes("update");
  const editButton = hasUpdate
    ? `<DetailEditDialog endpoint="/${kebab(table)}" record={{ ...record }} fields={editFields} onupdated={(updated) => record = { ...record, ...updated } as NonNullable<typeof record>} />`
    : "";
  const source = `<script lang="ts">\n  import { onMount } from 'svelte'\n  import { page } from '$app/state'\n  import { treaty } from '@elysiajs/eden'\n  import type { App } from '../../../../../src/app'\n  import type { ${model} } from '../../../../../src/db/schema/${kebab(table)}'\n  const api = treaty<App>('http://localhost:3000')\n  let record = $state<${model} | null>(null)\n  let message = $state('')\n  onMount(async () => { const result = await api.${table}({ id: Number(page.params.id) }).get(); if (result.error) message = 'Could not load ${singular}'; else record = result.data })\n</script>\n<svelte:head><title>${model} details</title></svelte:head>\n<main class="mx-auto max-w-3xl px-6 py-16"><a class="text-sm font-medium text-zinc-600 hover:text-zinc-950" href="/${kebab(table)}">← Back to ${model}s</a>{#if message}<p class="mt-8 rounded-md bg-red-50 p-3 text-red-700">{message}</p>{:else if record}<div class="mt-8 rounded-xl border bg-white p-6 shadow-sm"><p class="text-sm font-medium uppercase tracking-widest text-zinc-500">${model}</p><h1 class="mt-2 text-4xl font-bold">${model} #{record.id}</h1><dl class="mt-8">${rows}</dl></div>{/if}</main>\n`;
  const detailSource = source
    .replace(
      "  import type { App }",
      `${hasUpdate ? "  import DetailEditDialog, { type EditField } from '$lib/components/detail-edit-dialog.svelte'\n" : ""}${dateTimeImport}  import type { App }`,
    )
    .replace(
      "  const api = treaty<App>('http://localhost:3000')",
      `  const api = treaty<App>('http://localhost:3000')${hasUpdate ? `\n  const editFields = [${editFields}] satisfies EditField[]` : ""}`,
    )
    .replace(
      `<main class="mx-auto max-w-3xl px-6 py-16"><a class="text-sm font-medium text-zinc-600 hover:text-zinc-950" href="/${kebab(table)}">← Back to ${model}s</a>`,
      `<main class="mx-auto max-w-3xl px-6 py-16"><div class="flex items-center justify-between"><a class="text-sm font-medium text-zinc-600 hover:text-zinc-950" href="/${kebab(table)}">← Back to ${model}s</a>{#if record}${editButton}{/if}</div>`,
    )
    .replaceAll(
      "text-zinc-600 hover:text-zinc-950",
      "text-muted-foreground hover:text-foreground",
    )
    .replaceAll("border-zinc-100", "border-border")
    .replaceAll("text-zinc-500", "text-muted-foreground")
    .replace(
      "border bg-white p-6 shadow-sm",
      "border bg-card p-6 text-card-foreground shadow-sm",
    )
    .replace(
      "bg-red-50 p-3 text-red-700",
      "bg-destructive/10 p-3 text-destructive",
    );
  const extraTypes = [
    ...attachments.map(
      (field) =>
        `${field.name}${field.attachment!.multiple ? "Urls" : "Url"}: ${field.attachment!.multiple ? "string[]" : "string | null"}`,
    ),
    ...collections.map(
      (field) => `${field.collection!.relation}Ids: Array<string | number>`,
    ),
  ];
  const typedSource = extraTypes.length
    ? detailSource.replace(
        `  let record = $state<${model} | null>(null)`,
        `  type ${model}Record = ${model} & { ${extraTypes.join(", ")} }\n  let record = $state<${model}Record | null>(null)`,
      )
    : detailSource;
  await ensureNew(
    join(cwd, "web", "src", "routes", kebab(table), "[id]", "+page.svelte"),
    typedSource
      .replace("Number(page.params.id)", "page.params.id!")
      .replaceAll(`${model}s`, humanize(table)),
  );
}

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
