import { defineDatabases } from '@bunway/core'

export default defineDatabases({
  primary: {
    adapter: 'postgres',
    url: Bun.env.DATABASE_URL,
  },
})
