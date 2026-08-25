import { join } from "node:path";
import {
  validatorFor,
  parseFields,
  type IdEncoding,
  type IdType,
} from "../fields";
import { CliError, insertBefore, kebab } from "../utils";
import { database as configuredDatabase, databaseDirectory } from "../databases";
import type { DatabaseAdapter } from "@bunway/core";
import { ensureNew } from "../writing";
import { collectionInfo, names } from "./shared";
import { generateModel, resolveRelationshipIdTypes } from "./model";
import { generateResourceUi, registerResource } from "./ui";

const idValidator = (idType: IdType) =>
  idType === "uuid" ? "t.String()" : "t.Numeric()";
const idValue = (expression: string, idType: IdType) =>
  idType === "uuid" ? expression : `Number(${expression})`;

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
