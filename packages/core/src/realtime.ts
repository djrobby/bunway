import { Elysia, t, type Static, type TSchema } from 'elysia'

export type RealtimeEnvelope<Type extends string = string, Data = unknown> = {
  channel: string
  type: Type
  data: Data
  timestamp: string
}

type Subscriber = (event: RealtimeEnvelope) => void

const subscribers = new Map<string, Set<Subscriber>>()
const socketSubscriptions = new WeakMap<object, () => void>()

export const broker = {
  publish(channel: string, type: string, data: unknown) {
    const event = { channel, type, data, timestamp: new Date().toISOString() }
    for (const subscriber of subscribers.get(channel) ?? []) subscriber(event)
    return event
  },
  subscribe(channel: string, subscriber: Subscriber) {
    const channelSubscribers = subscribers.get(channel) ?? new Set<Subscriber>()
    channelSubscribers.add(subscriber)
    subscribers.set(channel, channelSubscribers)
    return () => {
      channelSubscribers.delete(subscriber)
      if (!channelSubscribers.size) subscribers.delete(channel)
    }
  },
  count(channel?: string) {
    if (channel) return subscribers.get(channel)?.size ?? 0
    return [...subscribers.values()].reduce((total, group) => total + group.size, 0)
  },
}

type EventSchemas = Record<string, TSchema>
type ChannelEvent<Events extends EventSchemas> = {
  [Type in keyof Events & string]: RealtimeEnvelope<Type, Static<Events[Type]>>
}[keyof Events & string]
type Parameters<Path extends string> = Path extends `${string}:${string}` ? [value: string | number] : []

function topic(path: string, parameters: Array<string | number>) {
  let index = 0
  return path.replace(/:[^/]+/g, () => {
    const value = parameters[index++]
    if (value === undefined) throw new Error(`Missing realtime channel parameter for "${path}"`)
    return String(value)
  }).replaceAll('/', ':')
}

export function channel<const Path extends string, const Events extends EventSchemas>(
  path: Path,
  options: { events: Events },
) {
  type Event = ChannelEvent<Events>
  return {
    path,
    events: options.events,
    publish<Type extends keyof Events & string>(
      ...args: [...Parameters<Path>, type: Type, data: Static<Events[Type]>]
    ) {
      const parameters = args.slice(0, -2) as Array<string | number>
      return broker.publish(topic(path, parameters), args.at(-2) as string, args.at(-1)) as Event
    },
  }
}

export const realtime = {
  publish(channel: string, type: string, data: unknown) {
    return broker.publish(channel, type, data)
  },
}

export type JobProgress = {
  status: 'running' | 'completed' | 'failed'
  progress: number
  message: string
}

export function publishJobProgress(id: string | number, progress: JobProgress) {
  return broker.publish(`jobs:${id}`, 'progress', progress)
}

export const realtimeRoutes = new Elysia({ name: '@bunway/realtime' })
  .get('/realtime/sse', ({ query, request }) => {
    let unsubscribe = () => {}
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode(': connected\n\n'))
        unsubscribe = broker.subscribe(query.channel, (event) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        })
        request.signal.addEventListener('abort', unsubscribe, { once: true })
      },
      cancel: () => unsubscribe(),
    })
    return new Response(stream, {
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
      },
    })
  }, { query: t.Object({ channel: t.String({ minLength: 1 }) }) })
  .ws('/realtime/ws', {
    query: t.Object({ channel: t.String({ minLength: 1 }) }),
    open(ws) {
      const unsubscribe = broker.subscribe(ws.data.query.channel, (event) => ws.send(event))
      socketSubscriptions.set(ws.raw, unsubscribe)
    },
    message(ws, message) {
      if (!message || typeof message !== 'object' || !('type' in message) || !('data' in message)) return
      broker.publish(ws.data.query.channel, String(message.type), message.data)
    },
    close(ws) {
      socketSubscriptions.get(ws.raw)?.()
      socketSubscriptions.delete(ws.raw)
    },
    body: t.Object({ type: t.String(), data: t.Any() }),
  })
