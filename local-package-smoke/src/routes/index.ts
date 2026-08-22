import { Elysia } from 'elysia'
import { storageRoutes } from './storage'
import { categoriesRoutes } from './categories'
import { tagsRoutes } from './tags'
import { productsRoutes } from './products'
// bunway:imports

export const routes = new Elysia()
  .use(storageRoutes)
  .get('/', () => ({ name: 'Bunway', status: 'ok' }))
  .use(categoriesRoutes)
  .use(tagsRoutes)
  .use(productsRoutes)
// bunway:routes
