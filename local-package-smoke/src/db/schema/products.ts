import { relations } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { categories } from './categories'
import { taggings } from './taggings'

export const products = pgTable(
  'products',
  {
    id: uuid('id')
      .$defaultFn(() => Bun.randomUUIDv7())
      .primaryKey(),
    name: text('name').notNull(),
    categoryId: uuid('categoryId')
      .notNull()
      .references(() => categories.id),
    createdAt: timestamp('createdAt', { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [index('products_categoryId_idx').on(table.categoryId)],
)

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  tags: many(taggings),
}))

export type Product = typeof products.$inferSelect
