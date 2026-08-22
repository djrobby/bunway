import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const categories = pgTable('categories', {
  id: uuid('id')
    .$defaultFn(() => Bun.randomUUIDv7())
    .primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('createdAt', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'string' }).notNull().defaultNow(),
})

export type Category = typeof categories.$inferSelect
