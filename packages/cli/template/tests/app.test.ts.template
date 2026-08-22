import { expect, test } from 'bun:test'
import { app } from '../src/app'

test('application boots', async () => {
  const response = await app.handle(new Request('http://localhost/'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ name: 'Bunway', status: 'ok' })
})
