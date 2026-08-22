import { Elysia } from 'elysia'
import { storage } from '../storage'

export const storageRoutes = new Elysia().get('/storage/*', async ({ params, status, set }) => {
  const object = await storage.get(params['*'])
  if (!object) return status(404, { message: 'file not found' })
  if (object.type) set.headers['content-type'] = object.type
  return object.body
})
