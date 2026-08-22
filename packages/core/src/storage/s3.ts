import type { StorageAdapter, UploadedFile } from './types'

export type S3StorageOptions = {
  bucket: string
  accessKeyId?: string
  secretAccessKey?: string
  endpoint?: string
  region?: string
  publicUrl?: string
}

export class S3StorageAdapter implements StorageAdapter {
  private readonly client: Bun.S3Client

  constructor(private readonly options: S3StorageOptions) {
    this.client = new Bun.S3Client(options)
  }

  async put(key: string, file: UploadedFile) {
    await this.client.write(key, file.data, { type: file.type })
  }

  async get(key: string) {
    const file = this.client.file(key)
    return (await file.exists()) ? { body: file, type: file.type } : null
  }

  async delete(key: string) {
    await this.client.delete(key)
  }

  async exists(key: string) {
    return this.client.exists(key)
  }

  url(key: string) {
    if (this.options.publicUrl) return `${this.options.publicUrl.replace(/\/$/, '')}/${key}`
    return this.client.presign(key, { expiresIn: 3600 })
  }
}
