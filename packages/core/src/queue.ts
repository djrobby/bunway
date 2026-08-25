import { sql, jobsDatabaseUrl } from './database'

export type EnqueuedJob = {
  queue: string
  name: string
  payload: string
  maxAttempts: number
  runAt: Date
}

export type ClaimedJob = {
  id: bigint
  queue: string
  name: string
  payload: unknown
  attempts: number
  maxAttempts: number
}

export type QueueDriver = {
  readonly name: 'postgres' | 'memory'
  ensureReady(): Promise<void>
  enqueue(job: EnqueuedJob): Promise<bigint>
  claim(workerId: string, queues: string[]): Promise<ClaimedJob | undefined>
  complete(id: bigint): Promise<void>
  fail(job: ClaimedJob, error: string): Promise<void>
}

const postgresQueue: QueueDriver = {
  name: 'postgres',
  async ensureReady() {
    await sql()`
      CREATE TABLE IF NOT EXISTS bunway_jobs (
        id bigserial PRIMARY KEY,
        queue text NOT NULL DEFAULT 'default',
        name text NOT NULL,
        payload jsonb NOT NULL,
        priority integer NOT NULL DEFAULT 0,
        run_at timestamptz NOT NULL DEFAULT now(),
        attempts integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL DEFAULT 3,
        locked_at timestamptz,
        locked_by text,
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz
      )
    `
    await sql()
      `CREATE INDEX IF NOT EXISTS bunway_jobs_ready_idx ON bunway_jobs (queue, run_at, priority DESC) WHERE finished_at IS NULL`
  },
  async enqueue({ queue, name, payload, maxAttempts, runAt }) {
    const [record] = await sql()`
      INSERT INTO bunway_jobs (queue, name, payload, max_attempts, run_at)
      VALUES (${queue}, ${name}, ${payload}::jsonb, ${maxAttempts}, ${runAt})
      RETURNING id
    `
    return BigInt(record.id)
  },
  async claim(workerId, queues) {
    const queueParameters = queues.map((_, index) => `$${index + 2}`).join(', ')
    const rows = await sql().unsafe(
      `
      UPDATE bunway_jobs SET locked_at = now(), locked_by = $1, attempts = attempts + 1
      WHERE id = (
        SELECT id FROM bunway_jobs
        WHERE finished_at IS NULL AND locked_at IS NULL AND run_at <= now()
          AND queue IN (${queueParameters})
        ORDER BY priority DESC, run_at, id
        FOR UPDATE SKIP LOCKED LIMIT 1
      ) RETURNING *
    `,
      [workerId, ...queues],
    )
    const record = rows[0]
    if (!record) return undefined
    return {
      id: BigInt(record.id),
      queue: record.queue,
      name: record.name,
      payload: record.payload,
      attempts: Number(record.attempts),
      maxAttempts: Number(record.max_attempts),
    }
  },
  async complete(id) {
    await sql()
      `UPDATE bunway_jobs SET finished_at = now(), locked_at = NULL, locked_by = NULL WHERE id = ${id}`
  },
  async fail(job, error) {
    await sql()
      `UPDATE bunway_jobs SET last_error = ${error}, locked_at = NULL, locked_by = NULL,
      finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END,
      run_at = CASE WHEN attempts < max_attempts THEN now() + (attempts * interval '5 seconds') ELSE run_at END
      WHERE id = ${job.id}`
  },
}

type MemoryRow = ClaimedJob & {
  payload: string
  priority: number
  runAt: Date
  locked: boolean
  finished: boolean
}

const memoryRows: MemoryRow[] = []
let nextMemoryId = 1n

export function clearMemoryQueue() {
  memoryRows.length = 0
  nextMemoryId = 1n
}

const memoryQueue: QueueDriver = {
  name: 'memory',
  async ensureReady() {},
  async enqueue({ queue, name, payload, maxAttempts, runAt }) {
    const id = nextMemoryId++
    memoryRows.push({
      id,
      queue,
      name,
      payload,
      priority: 0,
      runAt,
      attempts: 0,
      maxAttempts,
      locked: false,
      finished: false,
    })
    return id
  },
  async claim(_workerId, queues) {
    const now = new Date()
    const ready = memoryRows
      .filter(
        (row) =>
          !row.finished && !row.locked && row.runAt <= now && queues.includes(row.queue),
      )
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          a.runAt.getTime() - b.runAt.getTime() ||
          Number(a.id - b.id),
      )[0]
    if (!ready) return undefined
    ready.locked = true
    ready.attempts += 1
    return ready
  },
  async complete(id) {
    const row = memoryRows.find((candidate) => candidate.id === id)
    if (row) {
      row.finished = true
      row.locked = false
    }
  },
  async fail(job, error) {
    const row = memoryRows.find((candidate) => candidate.id === job.id)
    if (!row) return
    row.locked = false
    if (row.attempts >= row.maxAttempts) row.finished = true
    else row.runAt = new Date(Date.now() + row.attempts * 5000)
  },
}

let driver: QueueDriver | undefined

export function jobsDriver(): QueueDriver {
  if (driver) return driver
  const database = jobsDatabaseUrl()
  driver = database.url ? postgresQueue : memoryQueue
  const detail =
    driver.name === 'postgres'
      ? `using ${database.variable}`
      : `${database.variable} is not configured; jobs are process-local and non-durable`
  const line = `[bunway] jobs driver: ${driver.name} (${detail})`
  if (driver.name === 'memory' && Bun.env.NODE_ENV === 'production') console.warn(line)
  else console.log(line)
  return driver
}

export function resetJobsDriver() {
  driver = undefined
}
