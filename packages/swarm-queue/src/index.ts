/**
 * swarm-queue - Distributed job queue for multi-agent coordination
 *
 * Built on BullMQ and Redis for reliable job processing.
 *
 * ## Usage
 *
 * ```typescript
 * import { createQueue, createWorker } from 'swarm-queue';
 *
 * // Create a queue
 * const queue = await createQueue({
 *   name: 'tasks',
 *   connection: { host: 'localhost', port: 6379 }
 * });
 *
 * // Add a job
 * await queue.addJob('process-task', { data: 'example' });
 *
 * // Create a worker
 * const worker = await createWorker({
 *   queueName: 'tasks',
 *   connection: { host: 'localhost', port: 6379 }
 * }, async (job) => {
 *   // Process job
 *   return { success: true, data: job.data.payload };
 * });
 *
 * await worker.start();
 * ```
 */

import { Queue, Worker } from "bullmq";
import { nanoid } from "nanoid";
import type {
  JobData,
  JobOptions,
  JobProcessor,
  JobResult,
  QueueClient,
  QueueConfig,
  WorkerClient,
  WorkerConfig,
} from "./types";

// ============================================================================
// Type Exports
// ============================================================================

export type {
  JobData,
  JobOptions,
  JobProcessor,
  JobResult,
  QueueClient,
  QueueConfig,
  WorkerClient,
  WorkerConfig,
} from "./types";

// ============================================================================
// Event System
// ============================================================================

export type {
  QueueEvent,
  QueueEventType,
  QueueEventHandler,
  QueueEventEmitter,
  BaseQueueEvent,
  JobSubmittedEvent,
  JobStartedEvent,
  JobCompletedEvent,
  JobFailedEvent,
  JobProgressEvent,
  JobStalledEvent,
} from "./events";

export { createQueueEvent, isQueueEventType } from "./events";

// ============================================================================
// Notifications
// ============================================================================

export type {
  NotificationTarget,
  QueueNotifierConfig,
} from "./notifications";

export { QueueNotifier, createQueueNotifier } from "./notifications";

// ============================================================================
// SwarmQueue Client (enhanced wrapper)
// ============================================================================

export { SwarmQueue, createSwarmQueue } from "./client";
export { createConnection, closeConnection } from "./connection";

// ============================================================================
// SwarmWorker with Sandboxing
// ============================================================================

export {
  SwarmWorker,
  createSwarmWorker,
  type SwarmWorkerConfig,
  type SandboxedJobProcessor,
} from "./worker";

export {
  runSandboxed,
  isSystemdAvailable,
  DEFAULT_SANDBOX_CONFIG,
  type SandboxConfig,
  type SandboxResult,
} from "./sandbox";

// ============================================================================
// Queue Factory
// ============================================================================

/**
 * Create a queue client for adding and managing jobs
 */
export async function createQueue(config: QueueConfig): Promise<QueueClient> {
  const queue = new Queue(config.name, {
    connection: config.connection || {
      host: "localhost",
      port: 6379,
    },
    defaultJobOptions: config.defaultJobOptions,
    ...config,
  });

  return {
    async addJob<T = unknown>(
      type: string,
      payload: T,
      options?: JobOptions
    ): Promise<string> {
      const jobId = options?.jobId || nanoid();
      const jobData: JobData<T> = {
        type,
        payload,
        metadata: options?.removeOnComplete ? undefined : { jobId },
      };

      await queue.add(type, jobData, {
        ...options,
        jobId,
      });

      return jobId;
    },

    async getJob(jobId: string) {
      return queue.getJob(jobId);
    },

    async removeJob(jobId: string) {
      await queue.remove(jobId);
    },

    async getMetrics() {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      return { waiting, active, completed, failed, delayed };
    },

    async close() {
      await queue.close();
    },
  };
}

// ============================================================================
// Worker Factory
// ============================================================================

/**
 * Create a worker client for processing jobs
 */
export async function createWorker<T = unknown, R = unknown>(
  config: WorkerConfig,
  processor: JobProcessor<T, R>
): Promise<WorkerClient> {
  const worker = new Worker<JobData<T>, JobResult<R>>(
    config.queueName,
    async (job) => {
      return processor(job);
    },
    {
      connection: config.connection || {
        host: "localhost",
        port: 6379,
      },
      concurrency: config.concurrency || 1,
      maxStalledCount: config.maxStalledCount || 3,
      stalledInterval: config.stalledInterval || 30000,
      ...config,
    }
  );

  // Worker starts processing immediately on construction
  // Expose start/stop for explicit control

  return {
    async start() {
      // Worker auto-starts, this is a no-op for symmetry
      await worker.waitUntilReady();
    },

    async stop() {
      await worker.pause();
    },

    async close() {
      await worker.close();
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a simple success result
 */
export function success<T = unknown>(data: T, metadata?: Record<string, unknown>): JobResult<T> {
  return { success: true, data, metadata };
}

/**
 * Create a simple failure result
 */
export function failure(error: string, metadata?: Record<string, unknown>): JobResult<never> {
  return { success: false, error, metadata };
}
