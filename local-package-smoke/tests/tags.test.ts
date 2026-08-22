import { describe, expect, test } from 'bun:test'
import { app } from '../src/app'

describe('tags', () => {
  test('validates create input', async () => {
    const response = await app.handle(
      new Request('http://localhost/tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    )
    expect(response.status).toBe(422)
  })
})
