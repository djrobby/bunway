export type JobOptions = {
  queue?: string;
  maxAttempts?: number;
  runAt?: Date;
};

export type JobContext = {
  id: string;
  attempt: number;
  maxAttempts: number;
  progress(percent: number, message: string): Promise<void>;
};

export type Job<Payload> = {
  name: string;
  performNow(payload: Payload, options?: { id?: string }): Promise<void>;
  performLater(payload: Payload, options?: JobOptions): Promise<bigint>;
};

export type WorkerOptions = {
  queues?: string[];
  pollInterval?: number;
  concurrency?: number;
};

export type Handler = (
  payload: unknown,
  context: JobContext,
) => Promise<void> | void;
