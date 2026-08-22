import { describe, expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LocalStorageAdapter, uploadedFile } from '../packages/core/src'

describe('local storage', () => {
  test('stores, reads, addresses, and deletes an uploaded file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bunway-storage-'))
    const storage = new LocalStorageAdapter(root, 'http://localhost:3000/storage')
    const file = uploadedFile(new File(['hello'], 'hello.txt', { type: 'text/plain' }))
    await storage.put('ab/hello.txt', file)
    expect(await storage.exists('ab/hello.txt')).toBe(true)
    expect(await (await storage.get('ab/hello.txt'))!.body.text()).toBe('hello')
    expect(storage.url('ab/hello.txt')).toBe('http://localhost:3000/storage/ab/hello.txt')
    await storage.delete('ab/hello.txt')
    expect(await storage.exists('ab/hello.txt')).toBe(false)
  })

  test('rejects keys outside its root', () => {
    const storage = new LocalStorageAdapter(join(tmpdir(), 'bunway-storage-root'))
    expect(storage.get('../secret')).rejects.toThrow('Invalid storage key')
  })
})
