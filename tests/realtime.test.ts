import { describe, expect, test } from 'bun:test'
import { Elysia, t } from 'elysia'
import { broker, channel, realtimeRoutes } from '../packages/core/src/realtime'
import { job } from '../packages/core/src/job'

describe('realtime', () => {
  test('publishes, receives, and removes broker subscriptions', () => {
    const events: unknown[] = []
    const unsubscribe = broker.subscribe('orders:1', event => events.push(event))
    broker.publish('orders:1', 'updated', { status: 'processing' })
    expect(events).toHaveLength(1)
    expect(broker.count('orders:1')).toBe(1)
    unsubscribe()
    expect(broker.count('orders:1')).toBe(0)
  })

  test('typed channels resolve parameters and publish envelopes', () => {
    const orders = channel('orders/:id', { events: { updated: t.Object({ status: t.String() }) } })
    let received: unknown
    const unsubscribe = broker.subscribe('orders:42', event => received = event)
    orders.publish(42, 'updated', { status: 'complete' })
    expect(received).toMatchObject({ channel: 'orders:42', type: 'updated', data: { status: 'complete' } })
    unsubscribe()
  })

  test('job progress reports completion and failure without SSE-specific job code', async () => {
    const events: Array<{ data: { status: string } }> = []
    const unsubscribe = broker.subscribe('jobs:audit', event => events.push(event as typeof events[number]))
    const complete = job('audit-complete', async (_payload: {}, { progress }) => {
      await progress(50, 'Working')
      await progress(100, 'Complete')
    })
    await complete.performNow({}, { id: 'audit' })
    expect(events.map(event => event.data.status)).toEqual(['running', 'completed'])

    events.length = 0
    const fail = job('audit-fail', async () => { throw new Error('Nope') })
    await expect(fail.performNow({}, { id: 'audit' })).rejects.toThrow('Nope')
    expect(events.at(-1)?.data.status).toBe('failed')
    unsubscribe()
  })

  test('SSE delivers an event and cleans up after abort', async () => {
    const controller = new AbortController()
    const response = await realtimeRoutes.handle(new Request(
      'http://localhost/realtime/sse?channel=notifications',
      { signal: controller.signal },
    ))
    const reader = response.body!.getReader()
    await reader.read()
    broker.publish('notifications', 'notification', { message: 'hello' })
    const chunk = await reader.read()
    expect(new TextDecoder().decode(chunk.value)).toContain('"message":"hello"')
    controller.abort()
    await reader.cancel()
    expect(broker.count('notifications')).toBe(0)
  })

  test('WebSocket broadcasts and cleans up', async () => {
    const app = new Elysia().use(realtimeRoutes).listen(0)
    const socket = new WebSocket(`ws://localhost:${app.server!.port}/realtime/ws?channel=room:demo`)
    const message = new Promise<string>((resolve, reject) => {
      socket.onerror = () => reject(new Error('WebSocket connection failed'))
      socket.onopen = () => socket.send(JSON.stringify({ type: 'message', data: { text: 'hello' } }))
      socket.onmessage = event => resolve(String(event.data))
    })
    expect(await message).toContain('"text":"hello"')
    socket.close()
    await new Promise(resolve => socket.addEventListener('close', resolve, { once: true }))
    for (let attempt = 0; attempt < 20 && broker.count('room:demo'); attempt++) await Bun.sleep(5)
    expect(broker.count('room:demo')).toBe(0)
    await app.stop()
  })
})
