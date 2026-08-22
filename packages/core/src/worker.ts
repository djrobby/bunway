import { sql } from "./database";
import { handlers } from "./registry";
import type { WorkerOptions } from "./types";
import { publishJobProgress } from "./realtime";

export async function migrateJobs() {
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
  `;
  await sql()`CREATE INDEX IF NOT EXISTS bunway_jobs_ready_idx ON bunway_jobs (queue, run_at, priority DESC) WHERE finished_at IS NULL`;
}

async function claim(workerId: string, queues: string[]) {
  const queueParameters = queues.map((_, index) => `$${index + 2}`).join(", ");
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
  );
  return rows[0];
}

async function runOne(workerId: string, queues: string[]) {
  const record = await claim(workerId, queues);
  if (!record) return false;
  const handler = handlers.get(record.name);
  const id = String(record.id);
  let lastProgress = 0;
  let lastMessage = "Complete";
  try {
    if (!handler) throw new Error(`No registered job named "${record.name}"`);
    const payload =
      typeof record.payload === "string"
        ? JSON.parse(record.payload)
        : record.payload;
    await handler(payload, {
      id,
      attempt: Number(record.attempts),
      maxAttempts: Number(record.max_attempts),
      progress: async (progress, message) => {
        lastProgress = progress;
        lastMessage = message;
        if (progress < 100)
          publishJobProgress(id, { status: "running", progress, message });
      },
    });
    publishJobProgress(id, {
      status: "completed",
      progress: 100,
      message: lastMessage,
    });
    await sql()`UPDATE bunway_jobs SET finished_at = now(), locked_at = NULL, locked_by = NULL WHERE id = ${record.id}`;
  } catch (error) {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    publishJobProgress(id, {
      status: "failed",
      progress: lastProgress,
      message,
    });
    await sql()`UPDATE bunway_jobs SET last_error = ${message}, locked_at = NULL, locked_by = NULL,
      finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END,
      run_at = CASE WHEN attempts < max_attempts THEN now() + (attempts * interval '5 seconds') ELSE run_at END
      WHERE id = ${record.id}`;
    console.error(`[bunway] ${record.name} failed: ${message}`);
  }
  return true;
}

export async function workOnce(options: Pick<WorkerOptions, "queues"> = {}) {
  await migrateJobs();
  const queues = options.queues ?? ["default"];
  const workerId = `${Bun.env.HOSTNAME ?? Bun.env.COMPUTERNAME ?? "worker"}:${process.pid}:once`;
  return runOne(workerId, queues);
}

export async function work(options: WorkerOptions = {}) {
  await migrateJobs();
  const queues = options.queues ?? ["default"];
  const interval = options.pollInterval ?? 1000;
  const concurrency = options.concurrency ?? 1;
  const workerId = `${Bun.env.HOSTNAME ?? Bun.env.COMPUTERNAME ?? "worker"}:${process.pid}`;
  console.log(`[bunway] worker ${workerId} listening on ${queues.join(", ")}`);
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        if (!(await runOne(workerId, queues))) await Bun.sleep(interval);
      }
    }),
  );
}
