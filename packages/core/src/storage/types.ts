export type UploadedFile = {
  data: Blob
  name: string
  type: string
  size: number
}

export type StoredObject = {
  body: Blob
  type?: string
}

export interface StorageAdapter {
  put(key: string, file: UploadedFile): Promise<void>
  get(key: string): Promise<StoredObject | null>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  url(key: string): string | Promise<string>
}

export function uploadedFile(value: File | Blob, name?: string): UploadedFile {
  const fileName = value instanceof File ? value.name : name
  if (!fileName) throw new Error('A filename is required')
  return { data: value, name: fileName, type: value.type || 'application/octet-stream', size: value.size }
}
