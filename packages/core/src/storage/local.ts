import { dirname, join, normalize, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import type { StorageAdapter, UploadedFile } from './types'

export class LocalStorageAdapter implements StorageAdapter {
  readonly root: string

  constructor(root = join(process.cwd(), 'storage'), private readonly baseUrl = '/storage') {
    this.root = resolve(root)
  }

  private path(key: string) {
    const path = resolve(this.root, normalize(key))
    if (path !== this.root && !path.startsWith(`${this.root}${process.platform === 'win32' ? '\\' : '/'}`)) {
      throw new Error('Invalid storage key')
    }
    return path
  }

  async put(key: string, file: UploadedFile) {
    const path = this.path(key)
    await mkdir(dirname(path), { recursive: true })
    await Bun.write(path, file.data)
  }

  async get(key: string) {
    const file = Bun.file(this.path(key))
    return (await file.exists()) ? { body: file, type: file.type } : null
  }

  async delete(key: string) {
    const file = Bun.file(this.path(key))
    if (await file.exists()) await file.delete()
  }

  async exists(key: string) {
    return Bun.file(this.path(key)).exists()
  }

  url(key: string) {
    return `${this.baseUrl.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`
  }
}
