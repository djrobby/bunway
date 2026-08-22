import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const smokes = pgTable('smokes', {
  id: uuid('id')
    .$defaultFn(() => Bun.randomUUIDv7())
    .primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('createdAt', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'string' }).notNull().defaultNow(),
})

export type Smoke = typeof smokes.$inferSelect
