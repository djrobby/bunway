#!/usr/bin/env bun
import { createProject, CliError } from '@bunway/cli'

try {
  const database = Bun.argv.find(value => value.startsWith('--database='))?.slice(11)
  const postgresDriver = Bun.argv.find(value => value.startsWith('--postgres-driver='))?.slice(18)
  await createProject(Bun.argv[2], {
    install: !Bun.argv.includes('--no-install'),
    database: database as 'postgres' | 'mysql' | 'sqlite' | 'pocketbase' | undefined,
    postgresDriver: postgresDriver as 'pg' | 'postgres' | undefined,
  })
} catch (error) {
  console.error(error instanceof CliError ? `bunway: ${error.message}` : error)
  process.exit(1)
}
