import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const storageBlobs = pgTable('storage_blobs', {
  id: serial('id').primaryKey(),
  key: text('key').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow()
}, (table) => [uniqueIndex('storage_blobs_key_idx').on(table.key)])

export const storageAttachments = pgTable('storage_attachments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  recordType: text('record_type').notNull(),
  recordId: text('record_id').notNull(),
  blobId: integer('blob_id').notNull().references(() => storageBlobs.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow()
}, (table) => [
  index('storage_attachments_record_idx').on(table.recordType, table.recordId, table.name),
  index('storage_attachments_blob_idx').on(table.blobId)
])
