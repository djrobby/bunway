let client: InstanceType<typeof Bun.SQL> | undefined

export type DatabaseAdapter = 'postgres' | 'mysql' | 'sqlite'
export type DatabaseConnection = {
  adapter: DatabaseAdapter
  url: string | undefined
}

export function defineDatabases<const T extends Record<string, DatabaseConnection>>(databases: T): T {
  return databases
}

export function sql() {
  const name = Bun.env.BUNWAY_JOBS_DATABASE ?? 'primary'
  const variable = name === 'primary' ? 'DATABASE_URL' : `${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}_DATABASE_URL`
  const url = Bun.env[variable]
  if (!url) throw new Error(`${variable} is required to use Bunway jobs with database "${name}"`)
  if (!/^postgres(?:ql)?:\/\//.test(url)) throw new Error(`Bunway jobs require PostgreSQL; ${variable} is not a PostgreSQL URL`)
  return client ??= new Bun.SQL(url)
}
