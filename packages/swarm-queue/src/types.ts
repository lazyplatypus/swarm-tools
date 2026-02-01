/**
 * Core type definitions for swarm-queue
 * Based on BullMQ types with swarm-specific extensions
 */

import type { Job as BullJob, JobsOptions, QueueOptions, WorkerOptions } from "bullmq";

/**
 * Job data payload - generic to support different job types
 */
export interface JobData<T = unknown> {
  type: string;
  payload: T;
  metadata?: Record<string, unknown>;
}

/**
 * Job result payload - returned when job completes
 */
export interface JobResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Job options - extends BullMQ JobsOptions with swarm-specific fields
 */
export interface JobOptions extends Omit<JobsOptions, "jobId"> {
  /**
   * Unique job ID - defaults to nanoid if not provided
   */
  jobId?: string;

  /**
   * Priority (lower number = higher priority)
   */
  priority?: number;

  /**
   * Delay in milliseconds before job can be processed
   */
  delay?: number;

  /**
   * Number of times to retry failed jobs
   */
  attempts?: number;

  /**
   * Backoff strategy for retries
   */
  backoff?: {
    type: "exponential" | "fixed";
    delay: number;
  };

  /**
   * Remove job on completion
   */
  removeOnComplete?: boolean | number;

  /**
   * Remove job on failure
   */
  removeOnFail?: boolean | number;
}

/**
 * Queue configuration - extends BullMQ QueueOptions
 */
export interface QueueConfig extends Omit<QueueOptions, "connection"> {
  /**
   * Queue name
   */
  name: string;

  /**
   * Redis connection options (passed to ioredis)
   */
  connection?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };

  /**
   * Default job options for all jobs in this queue
   */
  defaultJobOptions?: JobOptions;
}

/**
 * Worker configuration - extends BullMQ WorkerOptions
 */
export interface WorkerConfig extends Omit<WorkerOptions, "connection"> {
  /**
   * Queue name to process
   */
  queueName: string;

  /**
   * Redis connection options (passed to ioredis)
   */
  connection?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };

  /**
   * Number of concurrent jobs to process
   */
  concurrency?: number;

  /**
   * Max number of jobs to process per worker
   */
  maxStalledCount?: number;

  /**
   * Stalled job check interval (ms)
   */
  stalledInterval?: number;
}

/**
 * Job processor function type
 */
export type JobProcessor<T = unknown, R = unknown> = (
  job: BullJob<JobData<T>>
) => Promise<JobResult<R>>;

/**
 * Queue client interface - facade for BullMQ Queue
 */
export interface QueueClient {
  /**
   * Add a job to the queue
   */
  addJob<T = unknown>(
    type: string,
    payload: T,
    options?: JobOptions
  ): Promise<string>;

  /**
   * Get job by ID
   */
  getJob(jobId: string): Promise<BullJob | undefined>;

  /**
   * Remove job by ID
   */
  removeJob(jobId: string): Promise<void>;

  /**
   * Get queue metrics
   */
  getMetrics(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }>;

  /**
   * Close queue connection
   */
  close(): Promise<void>;
}

/**
 * Worker client interface - facade for BullMQ Worker
 */
export interface WorkerClient {
  /**
   * Start processing jobs
   */
  start(): Promise<void>;

  /**
   * Stop processing jobs
   */
  stop(): Promise<void>;

  /**
   * Close worker connection
   */
  close(): Promise<void>;
}
