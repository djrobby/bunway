import { jobsDriver } from "./queue";
import { handlers } from "./registry";
import type { WorkerOptions } from "./types";
import { publishJobProgress } from "./realtime";

async function runOne(workerId: string, queues: string[]) {
  const driver = jobsDriver();
  const record = await driver.claim(workerId, queues);
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
      attempt: record.attempts,
      maxAttempts: record.maxAttempts,
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
    await driver.complete(record.id);
  } catch (error) {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    publishJobProgress(id, {
      status: "failed",
      progress: lastProgress,
      message,
    });
    await driver.fail(record, message);
    console.error(`[bunway] ${record.name} failed: ${message}`);
  }
  return true;
}

export async function migrateJobs() {
  await jobsDriver().ensureReady();
}

export async function workOnce(options: Pick<WorkerOptions, "queues"> = {}) {
  await migrateJobs();
  const queues = options.queues ?? ["default"];
  const workerId = `${Bun.env.HOSTNAME ?? Bun.env.COMPUTERNAME ?? "worker"}:${process.pid}:once`;
  return runOne(workerId, queues);
}

export async function work(options: WorkerOptions = {}) {
  const driver = jobsDriver();
  await driver.ensureReady();
  const queues = options.queues ?? ["default"];
  const interval = options.pollInterval ?? 1000;
  const concurrency = options.concurrency ?? 1;
  const workerId = `${Bun.env.HOSTNAME ?? Bun.env.COMPUTERNAME ?? "worker"}:${process.pid}`;
  console.log(
    `[bunway] worker ${workerId} listening on ${queues.join(", ")} (${driver.name})`,
  );
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        if (!(await runOne(workerId, queues))) await Bun.sleep(interval);
      }
    }),
  );
}
