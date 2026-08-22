import { sql } from "./database";
import { handlers } from "./registry";
import type { Handler, Job, JobOptions } from "./types";
import { publishJobProgress } from "./realtime";

export function job<Payload>(
  name: string,
  handler: (
    payload: Payload,
    context: import("./types").JobContext,
  ) => Promise<void> | void,
): Job<Payload> {
  if (!name.trim()) throw new Error("A job name is required");
  handlers.set(name, handler as Handler);

  return {
    name,
    async performNow(payload, options = {}) {
      const id = options.id ?? crypto.randomUUID();
      let lastProgress = 0;
      let lastMessage = "Complete";
      const progress = async (percent: number, message: string) => {
        lastProgress = percent;
        lastMessage = message;
        if (percent < 100)
          publishJobProgress(id, {
            status: "running",
            progress: percent,
            message,
          });
      };
      try {
        await handler(payload, { id, attempt: 1, maxAttempts: 1, progress });
        publishJobProgress(id, {
          status: "completed",
          progress: 100,
          message: lastMessage,
        });
      } catch (error) {
        publishJobProgress(id, {
          status: "failed",
          progress: lastProgress,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    async performLater(payload, options: JobOptions = {}) {
      const [record] = await sql()`
        INSERT INTO bunway_jobs (queue, name, payload, max_attempts, run_at)
        VALUES (${options.queue ?? "default"}, ${name}, ${JSON.stringify(payload)}::jsonb,
          ${options.maxAttempts ?? 3}, ${options.runAt ?? new Date()})
        RETURNING id
      `;
      return BigInt(record.id);
    },
  };
}
