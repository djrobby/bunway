import { and, eq } from 'drizzle-orm'
import type { StorageAdapter, UploadedFile } from './types'

type Row = { id: string | number }
type BlobRow = { id: number; key: string; filename: string; contentType: string; byteSize: number }
type Tables = { blobs: any; attachments: any }
type Database = any

export type Attachment = {
  attach(file: UploadedFile): Promise<void>
  url(): Promise<string | null>
  item(): Promise<AttachmentItem | null>
  detach(): Promise<void>
  purge(): Promise<void>
}

export type Attachments = {
  attach(file: UploadedFile): Promise<void>
  urls(): Promise<string[]>
  items(): Promise<AttachmentItem[]>
  detach(blobId?: number): Promise<void>
  purge(blobId?: number): Promise<void>
}

export type AttachmentItem = {
  id: number
  filename: string
  contentType: string
  byteSize: number
  url: string
}

export type AttachmentDefinition = { multiple?: boolean }

function objectKey(file: UploadedFile) {
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop()!.replace(/[^a-zA-Z0-9]/g, '')}` : ''
  return `${crypto.randomUUID().replaceAll('-', '')}${extension}`
}

export function attachmentHydrator<TRow extends Row, TDefinitions extends Record<string, AttachmentDefinition>>(
  options: {
    db: Database
    tables: Tables
    storage: StorageAdapter
    recordType: string
    definitions: TDefinitions
  }
) {
  const { db, tables, storage, recordType, definitions } = options

  async function blobs(recordId: string | number, name: string): Promise<BlobRow[]> {
    const persistedId = String(recordId)
    return db
      .select({
        id: tables.blobs.id,
        key: tables.blobs.key,
        filename: tables.blobs.filename,
        contentType: tables.blobs.contentType,
        byteSize: tables.blobs.byteSize
      })
      .from(tables.attachments)
      .innerJoin(tables.blobs, eq(tables.attachments.blobId, tables.blobs.id))
      .where(
        and(
          eq(tables.attachments.recordType, recordType),
          eq(tables.attachments.recordId, persistedId),
          eq(tables.attachments.name, name)
        )
      )
      .orderBy(tables.attachments.id)
  }

  async function attach(recordId: string | number, name: string, file: UploadedFile, multiple: boolean) {
    if (!multiple) await purge(recordId, name)
    const key = objectKey(file)
    await storage.put(key, file)
    try {
      await db.transaction(async (tx: Database) => {
        const [blob] = await tx
          .insert(tables.blobs)
          .values({ key, filename: file.name, contentType: file.type, byteSize: file.size })
          .returning({ id: tables.blobs.id })
        await tx.insert(tables.attachments).values({
          name,
          recordType,
          recordId: String(recordId),
          blobId: blob.id
        })
      })
    } catch (error) {
      await storage.delete(key)
      throw error
    }
  }

  async function detach(recordId: string | number, name: string, blobId?: number) {
    const conditions = [
      eq(tables.attachments.recordType, recordType),
      eq(tables.attachments.recordId, String(recordId)),
      eq(tables.attachments.name, name)
    ]
    if (blobId !== undefined) conditions.push(eq(tables.attachments.blobId, blobId))
    await db.delete(tables.attachments).where(and(...conditions))
  }

  async function purge(recordId: string | number, name: string, blobId?: number) {
    const selected = (await blobs(recordId, name)).filter(blob => blobId === undefined || blob.id === blobId)
    const deleted = await db.transaction(async (tx: Database) => {
      const keys: string[] = []
      const conditions = [
        eq(tables.attachments.recordType, recordType),
        eq(tables.attachments.recordId, String(recordId)),
        eq(tables.attachments.name, name)
      ]
      if (blobId !== undefined) conditions.push(eq(tables.attachments.blobId, blobId))
      await tx.delete(tables.attachments).where(and(...conditions))
      for (const blob of selected) {
        const [remaining] = await tx
          .select({ id: tables.attachments.id })
          .from(tables.attachments)
          .where(eq(tables.attachments.blobId, blob.id))
          .limit(1)
        if (!remaining) {
          await tx.delete(tables.blobs).where(eq(tables.blobs.id, blob.id))
          keys.push(blob.key)
        }
      }
      return keys
    })
    await Promise.all(deleted.map((key: string) => storage.delete(key)))
  }

  return (record: TRow) => {
    const items = async (name: string) => Promise.all((await blobs(record.id, name)).map(async blob => ({
      id: blob.id,
      filename: blob.filename,
      contentType: blob.contentType,
      byteSize: blob.byteSize,
      url: await storage.url(blob.key)
    })))
    const handles = Object.fromEntries(
      Object.entries(definitions).map(([name, definition]) => {
        if (definition.multiple) {
          const handle: Attachments = {
            attach: file => attach(record.id, name, file, true),
            urls: async () => Promise.all((await blobs(record.id, name)).map(blob => storage.url(blob.key))),
            items: () => items(name),
            detach: blobId => detach(record.id, name, blobId),
            purge: blobId => purge(record.id, name, blobId)
          }
          return [name, handle]
        }
        const handle: Attachment = {
          attach: file => attach(record.id, name, file, false),
          url: async () => {
            const [blob] = await blobs(record.id, name)
            return blob ? storage.url(blob.key) : null
          },
          item: async () => (await items(name))[0] ?? null,
          detach: () => detach(record.id, name),
          purge: () => purge(record.id, name)
        }
        return [name, handle]
      })
    )
    return Object.assign(record, handles) as TRow & {
      [K in keyof TDefinitions]: TDefinitions[K]['multiple'] extends true ? Attachments : Attachment
    }
  }
}
