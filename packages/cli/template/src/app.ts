import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { routes } from './routes'
import { realtimeRoutes } from '@bunway/core/realtime'

export const app = new Elysia()
  .use(cors({ origin: Bun.env.CORS_ORIGIN ?? /^http:\/\/localhost:\d+$/ }))
  .use(realtimeRoutes)
  .use(routes)

export type App = typeof app

if (import.meta.main) {
  app.listen(Number(Bun.env.PORT ?? 3000))
  console.log(`API listening at http://localhost:${app.server?.port}`)
}
