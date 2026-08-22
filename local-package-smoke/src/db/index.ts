import { drizzle } from 'drizzle-orm/bun-sql'

if (!Bun.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

export const db = drizzle(new Bun.SQL(Bun.env.DATABASE_URL))
// bunway:databases
