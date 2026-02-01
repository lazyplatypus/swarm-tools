/**
 * Queue client wrapper for BullMQ with enhanced connection handling
 *
 * Provides a cleaner API over raw BullMQ Queue with:
 * - Connection management and retry logic
 * - Job submission with priority, delay, and retry options
 * - Job status queries and cancellation
 * - Queue metrics
 * - Graceful shutdown
 */

import { Queue } from "bullmq";
import { nanoid } from "nanoid";
import type { Job as BullJob } from "bullmq";
import type { JobData, JobOptions, QueueClient, QueueConfig } from "./types";

/**
 * SwarmQueue - Facade for BullMQ Queue with improved ergonomics
 */
export class SwarmQueue implements QueueClient {
  private queue: Queue;
  private isConnected: boolean = false;
  private isClosed: boolean = false;

  constructor(config: QueueConfig) {
    // BullMQ Queue creates its own Redis connection internally with retry logic
    this.queue = new Queue(config.name, {
      connection: config.connection || {
        host: "localhost",
        port: 6379,
      },
      defaultJobOptions: config.defaultJobOptions,
      ...config,
    });

    // Track connection state
    this.queue.on("error", (err: Error) => {
      console.error(`[SwarmQueue:${config.name}] Error:`, err.message);
      this.isConnected = false;
    });

    // Mark as connected (BullMQ handles connection internally)
    this.isConnected = true;
  }

  /**
   * Add a job to the queue
   *
   * @param type - Job type identifier
   * @param payload - Job data payload
   * @param options - Job options (priority, delay, retry, etc)
   * @returns Job ID
   */
  async addJob<T = unknown>(
    type: string,
    payload: T,
    options?: JobOptions
  ): Promise<string> {
    this.ensureNotClosed();

    const jobId = options?.jobId || nanoid();
    const jobData: JobData<T> = {
      type,
      payload,
      metadata: options?.removeOnComplete ? undefined : { jobId },
    };

    await this.queue.add(type, jobData, {
      ...options,
      jobId,
    });

    return jobId;
  }

  /**
   * Get job by ID
   *
   * @param jobId - Unique job identifier
   * @returns Job instance or undefined if not found
   */
  async getJob(jobId: string): Promise<BullJob | undefined> {
    this.ensureNotClosed();
    return this.queue.getJob(jobId);
  }

  /**
   * Remove (cancel) a job by ID
   *
   * Works for jobs in any state (waiting, delayed, active, completed, failed)
   *
   * @param jobId - Job ID to remove
   */
  async removeJob(jobId: string): Promise<void> {
    this.ensureNotClosed();
    await this.queue.remove(jobId);
  }

  /**
   * Get queue metrics across all job states
   *
   * @returns Object with counts for each job state
   */
  async getMetrics(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    this.ensureNotClosed();

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Gracefully close the queue
   *
   * Waits for in-flight operations to complete before closing the Redis connection
   */
  async close(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;

    // Close BullMQ queue (this also closes the Redis connection)
    await this.queue.close();

    this.isConnected = false;
  }

  /**
   * Ensure queue is not closed before operations
   */
  private ensureNotClosed(): void {
    if (this.isClosed) {
      throw new Error("Queue is closed. Cannot perform operations on closed queue.");
    }
  }

  /**
   * Get underlying BullMQ queue instance
   *
   * Use this for advanced BullMQ features not exposed by the facade
   */
  get underlying(): Queue {
    return this.queue;
  }
}

/**
 * Factory function to create a SwarmQueue instance
 *
 * @param config - Queue configuration
 * @returns SwarmQueue instance
 */
export function createSwarmQueue(config: QueueConfig): SwarmQueue {
  return new SwarmQueue(config);
}
