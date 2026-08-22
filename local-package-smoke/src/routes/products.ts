import { Elysia, t } from 'elysia'
import { asc, count, desc, eq, and, ilike, or, inArray } from 'drizzle-orm'
import { db } from '../db'
import { products } from '../db/schema/products'
import { taggings } from '../db/schema/taggings'

const body = t.Object({
  name: t.String(),
  categoryId: t.String(),
})

async function withAssociations<T extends typeof products.$inferSelect>(records: T[]) {
  const tagsRows = records.length
    ? await db
        .select({ ownerId: taggings.taggableId, relatedId: taggings.tagId })
        .from(taggings)
        .where(
          and(
            eq(taggings.taggableType, 'Product'),
            inArray(
              taggings.taggableId,
              records.map((record) => record.id),
            ),
          ),
        )
    : []
  return records.map((record) => ({
    ...record,
    tagsIds: tagsRows.filter((row) => row.ownerId === record.id).map((row) => row.relatedId),
  }))
}

export const productsRoutes = new Elysia({ prefix: '/products' })
  .get(
    '/',
    async ({ query }) => {
      const page = Math.max(1, Number(query.page ?? 1))
      const requested = query.perPage ?? '50'
      const perPage =
        requested === 'all' ? null : Math.min(250, Math.max(1, Number(requested) || 50))
      const condition = query.filter?.trim()
        ? or(ilike(products.name, `%${query.filter!.trim()}%`))
        : undefined
      const sortColumns = { id: products.id, name: products.name, categoryId: products.categoryId }
      const sortColumn = sortColumns[query.sort as keyof typeof sortColumns] ?? sortColumns.id
      const direction = query.order === 'desc' ? desc : asc
      const [{ total }] = condition
        ? await db.select({ total: count() }).from(products).where(condition)
        : await db.select({ total: count() }).from(products)
      const base = condition
        ? db.select().from(products).where(condition)
        : db.select().from(products)
      const records =
        perPage === null
          ? await base.orderBy(direction(sortColumn))
          : await base
              .orderBy(direction(sortColumn))
              .limit(perPage)
              .offset((page - 1) * perPage)
      return { records: await withAssociations(records), total }
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        perPage: t.Optional(t.String()),
        filter: t.Optional(t.String()),
        sort: t.Optional(t.String()),
        order: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')])),
      }),
    },
  )
  .get(
    '/:id',
    async ({ params, status }) => {
      const [record] = await db.select().from(products).where(eq(products.id, params.id)).limit(1)
      return record
        ? (await withAssociations([record]))[0]
        : status(404, { message: 'product not found' })
    },
    { params: t.Object({ id: t.String() }) },
  )
  .post(
    '/',
    async ({ body, status }) => {
      const values = body
      const [record] = await db.insert(products).values(values).returning()

      return status(201, record)
    },
    { body },
  )
  .patch(
    '/:id',
    async ({ params, body, status }) => {
      const values = body
      const [record] = await db
        .update(products)
        .set({ ...values, updatedAt: new Date().toISOString() })
        .where(eq(products.id, params.id))
        .returning()
      if (!record) return status(404, { message: 'product not found' })

      return record
    },
    { params: t.Object({ id: t.String() }), body: t.Partial(body) },
  )
  .delete(
    '/:id',
    async ({ params, status }) => {
      const [existing] = await db.select().from(products).where(eq(products.id, params.id)).limit(1)
      if (!existing) return status(404, { message: 'product not found' })

      await db
        .delete(taggings)
        .where(and(eq(taggings.taggableType, 'Product'), eq(taggings.taggableId, existing.id)))
      await db.delete(products).where(eq(products.id, existing.id))
      return status(204)
    },
    { params: t.Object({ id: t.String() }) },
  )
  .get(
    '/:id/tags',
    async ({ params }) => {
      const rows = await db
        .select({ id: taggings.tagId })
        .from(taggings)
        .where(and(eq(taggings.taggableType, 'Product'), eq(taggings.taggableId, params.id)))
      return rows.map((row) => row.id)
    },
    { params: t.Object({ id: t.String() }) },
  )
  .put(
    '/:id/tags',
    async ({ params, body, status }) => {
      const ownerId = params.id
      await db.transaction(async (tx) => {
        await tx
          .delete(taggings)
          .where(and(eq(taggings.taggableType, 'Product'), eq(taggings.taggableId, ownerId)))
        if (body.ids.length)
          await tx
            .insert(taggings)
            .values(
              body.ids.map((tagId) => ({ taggableType: 'Product', taggableId: ownerId, tagId })),
            )
      })
      return status(204)
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ ids: t.Array(t.String(), { uniqueItems: true }) }),
    },
  )
