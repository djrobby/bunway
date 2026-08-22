export type RealtimeEnvelope<Type extends string = string, Data = unknown> = {
  channel: string
  type: Type
  data: Data
  timestamp: string
}

export type JobProgress = {
  status: 'running' | 'completed' | 'failed'
  progress: number
  message: string
}

type EventPayloads = Record<string, unknown>

function browserOrigin() {
  if (typeof window === 'undefined') throw new Error('Realtime browser helpers can only run in a browser')
  return `${window.location.protocol}//${window.location.hostname}:3000`
}

export const realtime = {
  subscribe<Event extends RealtimeEnvelope = RealtimeEnvelope>(
    channel: string,
    listener: (event: Event) => void,
    options: { baseUrl?: string } = {},
  ) {
    const source = new EventSource(
      `${options.baseUrl ?? browserOrigin()}/realtime/sse?channel=${encodeURIComponent(channel)}`,
    )
    source.onmessage = ({ data }) => listener(JSON.parse(data) as Event)
    return { source, close: () => source.close() }
  },
  connect<Events extends EventPayloads = EventPayloads>(
    channel: string,
    options: { baseUrl?: string } = {},
  ) {
    const origin = options.baseUrl ?? browserOrigin()
    const socket = new WebSocket(
      `${origin.replace(/^http/, 'ws')}/realtime/ws?channel=${encodeURIComponent(channel)}`,
    )
    const listeners = new Map<string, Set<(event: RealtimeEnvelope) => void>>()
    socket.onmessage = ({ data }) => {
      const event = JSON.parse(String(data)) as RealtimeEnvelope
      for (const listener of listeners.get(event.type) ?? []) listener(event)
    }
    return {
      socket,
      on<Type extends keyof Events & string>(
        type: Type,
        listener: (event: RealtimeEnvelope<Type, Events[Type]>) => void,
      ) {
        const group = listeners.get(type) ?? new Set()
        group.add(listener as (event: RealtimeEnvelope) => void)
        listeners.set(type, group)
        return () => group.delete(listener as (event: RealtimeEnvelope) => void)
      },
      send<Type extends keyof Events & string>(type: Type, data: Events[Type]) {
        socket.send(JSON.stringify({ type, data }))
      },
      close: () => socket.close(),
    }
  },
  job(id: string, listener: (event: RealtimeEnvelope<'progress', JobProgress>) => void, options: { baseUrl?: string } = {}) {
    return this.subscribe(`jobs:${id}`, listener, options)
  },
}
