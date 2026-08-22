import { Elysia } from 'elysia'
import { storageRoutes } from './storage'
// bunway:imports

export const routes = new Elysia()
  .use(storageRoutes)
  .get('/', () => ({ name: 'Bunway', status: 'ok' }))
// bunway:routes
