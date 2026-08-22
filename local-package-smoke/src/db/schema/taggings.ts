import { relations } from 'drizzle-orm'
import { index, uuid, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { tags } from './tags'

export const taggings = pgTable(
  'taggings',
  {
    tagId: uuid('tagId')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    taggableType: text('taggableType').notNull(),
    taggableId: uuid('taggableId').notNull(),
    createdAt: timestamp('createdAt', { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tagId, table.taggableType, table.taggableId] }),
    index('taggings_taggable_idx').on(table.taggableType, table.taggableId),
  ],
)

export const taggingsRelations = relations(taggings, ({ one }) => ({
  tag: one(tags, { fields: [taggings.tagId], references: [tags.id] }),
}))
