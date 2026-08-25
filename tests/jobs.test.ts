import { describe, expect, test } from "bun:test";
import { handlers } from "../packages/core/src/registry";
import {
  clearMemoryQueue,
  jobsDriver,
  resetJobsDriver,
} from "../packages/core/src/queue";
import { job } from "../packages/core/src/job";
import { workOnce } from "../packages/core/src/worker";

function useMemoryDriver() {
  delete Bun.env.BUNWAY_JOBS_DATABASE;
  delete Bun.env.DATABASE_URL;
  resetJobsDriver();
}

async function workQuiet(queues: string[]) {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return await workOnce({ queues });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

describe("jobs", () => {
  test("falls back to an announced in-memory driver without a database", () => {
    useMemoryDriver();
    const logs: string[] = [];
    const original = console.log;
    console.log = (message?: unknown) => logs.push(String(message));
    try {
      expect(jobsDriver().name).toBe("memory");
    } finally {
      console.log = original;
    }
    expect(logs.join("\n")).toContain("[bunway] jobs driver: memory");
    expect(logs.join("\n")).toContain("non-durable");
  });

  test("performLater enqueues, workOnce claims, executes, and completes", async () => {
    useMemoryDriver();
    clearMemoryQueue();
    handlers.delete("memory-complete");
    const seen: unknown[] = [];
    const ordered = job("memory-complete", async (payload: { id: string }) => {
      seen.push(payload);
    });
    const id = await ordered.performLater({ id: "order-1" });
    expect(typeof id).toBe("bigint");
    expect(await workQuiet(["default"])).toBe(true);
    expect(seen).toEqual([{ id: "order-1" }]);
    expect(await workQuiet(["default"])).toBe(false);
  });

  test("failures are recorded and retried after backoff", async () => {
    useMemoryDriver();
    clearMemoryQueue();
    handlers.delete("memory-failing");
    let attempts = 0;
    const failing = job("memory-failing", async () => {
      attempts += 1;
      throw new Error("boom");
    });
    await failing.performLater({}, { maxAttempts: 3 });
    expect(await workQuiet(["default"])).toBe(true);
    expect(attempts).toBe(1);
    expect(await workQuiet(["default"])).toBe(false);
  });

  test("exhausted attempts finish the job", async () => {
    useMemoryDriver();
    clearMemoryQueue();
    handlers.delete("memory-exhausted");
    const failing = job("memory-exhausted", async () => {
      throw new Error("permanent");
    });
    await failing.performLater({}, { maxAttempts: 1 });
    expect(await workQuiet(["default"])).toBe(true);
    expect(await workQuiet(["default"])).toBe(false);
  });

  test("runAt delays claiming", async () => {
    useMemoryDriver();
    clearMemoryQueue();
    handlers.delete("memory-delayed");
    const delayed = job("memory-delayed", async () => {});
    await delayed.performLater({}, { runAt: new Date(Date.now() + 60_000) });
    expect(await workQuiet(["default"])).toBe(false);
  });

  test("named queues are honored", async () => {
    useMemoryDriver();
    clearMemoryQueue();
    handlers.delete("memory-queued");
    const emails = job("memory-queued", async () => {});
    await emails.performLater({}, { queue: "emails" });
    expect(await workQuiet(["default"])).toBe(false);
    expect(await workQuiet(["emails"])).toBe(true);
  });
});

describe("postgres jobs", () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;

  test("migrate, enqueue, claim, execute, complete, and record failures", async () => {
    if (!databaseUrl) {
      console.log("[skip] TEST_DATABASE_URL is not configured");
      return;
    }
    Bun.env.DATABASE_URL = databaseUrl;
    resetJobsDriver();
    const { sql } = await import("../packages/core/src/database");
    const driver = jobsDriver();
    try {
      expect(driver.name).toBe("postgres");
      const queue = `bunway-test-${process.pid}`;
      handlers.delete("pg-ok");
      handlers.delete("pg-fail");
      const ok = job("pg-ok", async () => {});
      const bad = job("pg-fail", async () => {
        throw new Error("nope");
      });
      await driver.ensureReady();
      await sql()`DELETE FROM bunway_jobs WHERE queue = ${queue}`;
      await ok.performLater({}, { queue, maxAttempts: 3 });
      await bad.performLater({}, { queue, maxAttempts: 1 });
      expect(await workQuiet([queue])).toBe(true);
      expect(await workQuiet([queue])).toBe(true);
      expect(await workQuiet([queue])).toBe(false);
      const rows = await sql()`
        SELECT name, attempts, finished_at IS NOT NULL AS finished, last_error
        FROM bunway_jobs WHERE queue = ${queue} ORDER BY name
      `;
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        name: "pg-fail",
        attempts: 1,
        finished: true,
      });
      expect(String(rows[0].last_error)).toContain("nope");
      expect(rows[1]).toMatchObject({ name: "pg-ok", finished: true });
      await sql()`DELETE FROM bunway_jobs WHERE queue = ${queue}`;
    } finally {
      delete Bun.env.DATABASE_URL;
      resetJobsDriver();
    }
  });
});

