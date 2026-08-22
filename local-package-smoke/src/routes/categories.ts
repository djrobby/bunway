import { Elysia, t } from 'elysia'
import { asc, count, desc, eq, ilike, or } from 'drizzle-orm'
import { db } from '../db'
import { categories } from '../db/schema/categories'

const body = t.Object({
  name: t.String(),
})

export const categoriesRoutes = new Elysia({ prefix: '/categories' })
  .get(
    '/',
    async ({ query }) => {
      const page = Math.max(1, Number(query.page ?? 1))
      const requested = query.perPage ?? '50'
      const perPage =
        requested === 'all' ? null : Math.min(250, Math.max(1, Number(requested) || 50))
      const condition = query.filter?.trim()
        ? or(ilike(categories.name, `%${query.filter!.trim()}%`))
        : undefined
      const sortColumns = { id: categories.id, name: categories.name }
      const sortColumn = sortColumns[query.sort as keyof typeof sortColumns] ?? sortColumns.id
      const direction = query.order === 'desc' ? desc : asc
      const [{ total }] = condition
        ? await db.select({ total: count() }).from(categories).where(condition)
        : await db.select({ total: count() }).from(categories)
      const base = condition
        ? db.select().from(categories).where(condition)
        : db.select().from(categories)
      const records =
        perPage === null
          ? await base.orderBy(direction(sortColumn))
          : await base
              .orderBy(direction(sortColumn))
              .limit(perPage)
              .offset((page - 1) * perPage)
      return { records: records, total }
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
      const [record] = await db
        .select()
        .from(categories)
        .where(eq(categories.id, params.id))
        .limit(1)
      return record ? record : status(404, { message: 'category not found' })
    },
    { params: t.Object({ id: t.String() }) },
  )
  .post(
    '/',
    async ({ body, status }) => {
      const values = body
      const [record] = await db.insert(categories).values(values).returning()

      return status(201, record)
    },
    { body },
  )
  .patch(
    '/:id',
    async ({ params, body, status }) => {
      const values = body
      const [record] = await db
        .update(categories)
        .set({ ...values, updatedAt: new Date().toISOString() })
        .where(eq(categories.id, params.id))
        .returning()
      if (!record) return status(404, { message: 'category not found' })

      return record
    },
    { params: t.Object({ id: t.String() }), body: t.Partial(body) },
  )
  .delete(
    '/:id',
    async ({ params, status }) => {
      const [existing] = await db
        .select()
        .from(categories)
        .where(eq(categories.id, params.id))
        .limit(1)
      if (!existing) return status(404, { message: 'category not found' })

      await db.delete(categories).where(eq(categories.id, existing.id))
      return status(204)
    },
    { params: t.Object({ id: t.String() }) },
  )
