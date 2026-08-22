import { describe, expect, test } from 'bun:test'
import { app } from '../src/app'

describe('products', () => {
  test('validates create input', async () => {
    const response = await app.handle(
      new Request('http://localhost/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    )
    expect(response.status).toBe(422)
  })
})
