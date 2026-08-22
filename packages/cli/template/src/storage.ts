import { LocalStorageAdapter, S3StorageAdapter } from '@bunway/core'

function configuredStorage() {
  if ((Bun.env.STORAGE_SERVICE ?? 'local') === 'local') {
    return new LocalStorageAdapter(
      Bun.env.STORAGE_PATH,
      Bun.env.STORAGE_PUBLIC_URL ?? `http://localhost:${Bun.env.PORT ?? 3000}/storage`
    )
  }
  if (!Bun.env.STORAGE_BUCKET) throw new Error('STORAGE_BUCKET is required for S3 storage')
  return new S3StorageAdapter({
    bucket: Bun.env.STORAGE_BUCKET,
    accessKeyId: Bun.env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: Bun.env.STORAGE_SECRET_ACCESS_KEY,
    endpoint: Bun.env.STORAGE_ENDPOINT,
    region: Bun.env.STORAGE_REGION,
    publicUrl: Bun.env.STORAGE_PUBLIC_URL
  })
}

export const storage = configuredStorage()
