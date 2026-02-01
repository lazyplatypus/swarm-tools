/**
 * SwarmWorker - Worker implementation with resource limits and sandboxing
 *
 * Extends BullMQ Worker with:
 * - Resource-limited job execution via sandbox
 * - Progress reporting
 * - Graceful shutdown with job completion
 * - Configurable CPU/memory limits per job
 */

import { Worker } from "bullmq";
import type { Job as BullJob } from "bullmq";
import type { JobData, JobResult, WorkerConfig } from "./types";
import { runSandboxed, type SandboxConfig, DEFAULT_SANDBOX_CONFIG } from "./sandbox";

/**
 * Extended worker configuration with sandbox settings
 */
export interface SwarmWorkerConfig extends WorkerConfig {
  /**
   * Default sandbox configuration for all jobs
   * Can be overridden per-job via job data metadata
   */
  sandboxConfig?: SandboxConfig;

  /**
   * Enable sandboxing (default: true)
   * Set to false to run jobs without resource limits
   */
  enableSandbox?: boolean;
}

/**
 * Job processor that receives sandbox configuration
 */
export type SandboxedJobProcessor<T = unknown, R = unknown> = (
  job: BullJob<JobData<T>>,
  sandbox: typeof runSandboxed
) => Promise<JobResult<R>>;

/**
 * SwarmWorker - BullMQ Worker with resource limits
 */
export class SwarmWorker<T = unknown, R = unknown> {
  private worker: Worker<JobData<T>, JobResult<R>>;
  private isShuttingDown: boolean = false;
  private activeJobs: Set<string> = new Set();
  private config: SwarmWorkerConfig;

  constructor(
    config: SwarmWorkerConfig,
    processor: SandboxedJobProcessor<T, R>
  ) {
    this.config = config;

    // Create BullMQ worker with wrapped processor
    this.worker = new Worker<JobData<T>, JobResult<R>>(
      config.queueName,
      async (job) => {
        return this.processJob(job, processor);
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

    // Set up event handlers
    this.setupEventHandlers();
  }

  /**
   * Process a job with sandboxing and progress reporting
   */
  private async processJob(
    job: BullJob<JobData<T>>,
    processor: SandboxedJobProcessor<T, R>
  ): Promise<JobResult<R>> {
    // Track active job
    this.activeJobs.add(job.id!);

    try {
      // Check if shutting down
      if (this.isShuttingDown) {
        throw new Error("Worker is shutting down, rejecting new jobs");
      }

      // Report progress: started
      await job.updateProgress({ stage: "started", percent: 0 });

      // Determine sandbox configuration
      const sandboxConfig = this.getSandboxConfig(job);

      // Create sandboxed runner
      const enableSandbox = this.config.enableSandbox !== false;
      const sandboxRunner = enableSandbox
        ? (cmd: string, args: string[] = [], cfg?: SandboxConfig) =>
            runSandboxed(cmd, args, { ...sandboxConfig, ...cfg })
        : (cmd: string, args: string[] = [], cfg?: SandboxConfig) =>
            runSandboxed(cmd, args, cfg);

      // Execute processor
      const result = await processor(job, sandboxRunner);

      // Report progress: completed
      await job.updateProgress({ stage: "completed", percent: 100 });

      return result;
    } catch (error) {
      // Report progress: failed
      await job.updateProgress({
        stage: "failed",
        percent: 0,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return failure result
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // Remove from active jobs
      this.activeJobs.delete(job.id!);
    }
  }

  /**
   * Get sandbox configuration for a job
   * Merges default config with job-specific config from metadata
   */
  private getSandboxConfig(job: BullJob<JobData<T>>): SandboxConfig {
    const defaultConfig = this.config.sandboxConfig || DEFAULT_SANDBOX_CONFIG;
    const jobConfig = job.data.metadata?.sandboxConfig as SandboxConfig | undefined;

    return {
      ...defaultConfig,
      ...jobConfig,
    };
  }

  /**
   * Set up event handlers for logging and monitoring
   */
  private setupEventHandlers(): void {
    this.worker.on("completed", (job) => {
      console.log(`[SwarmWorker] Job ${job.id} completed`);
    });

    this.worker.on("failed", (job, error) => {
      console.error(`[SwarmWorker] Job ${job?.id} failed:`, error.message);
    });

    this.worker.on("error", (error) => {
      console.error(`[SwarmWorker] Worker error:`, error.message);
    });

    this.worker.on("stalled", (jobId) => {
      console.warn(`[SwarmWorker] Job ${jobId} stalled`);
    });
  }

  /**
   * Start processing jobs
   * Worker auto-starts, this waits until ready
   */
  async start(): Promise<void> {
    await this.worker.waitUntilReady();
    console.log(`[SwarmWorker] Started processing queue: ${this.config.queueName}`);
  }

  /**
   * Pause job processing
   * Jobs currently running will complete, but no new jobs will be picked up
   */
  async pause(): Promise<void> {
    await this.worker.pause();
    console.log(`[SwarmWorker] Paused processing`);
  }

  /**
   * Resume job processing after pause
   */
  async resume(): Promise<void> {
    await this.worker.resume();
    console.log(`[SwarmWorker] Resumed processing`);
  }

  /**
   * Gracefully shutdown the worker
   * Waits for active jobs to complete before closing
   *
   * @param timeout - Max time to wait for active jobs (ms), default 30s
   */
  async shutdown(timeout: number = 30000): Promise<void> {
    console.log(`[SwarmWorker] Starting graceful shutdown...`);
    this.isShuttingDown = true;

    // Pause accepting new jobs
    await this.worker.pause();

    // Wait for active jobs to complete or timeout
    const startTime = Date.now();
    while (this.activeJobs.size > 0) {
      const elapsed = Date.now() - startTime;
      if (elapsed > timeout) {
        console.warn(
          `[SwarmWorker] Shutdown timeout reached, ${this.activeJobs.size} jobs still active`
        );
        break;
      }

      // Wait 100ms before checking again
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Close worker
    await this.worker.close();
    console.log(`[SwarmWorker] Shutdown complete`);
  }

  /**
   * Close worker immediately without waiting for active jobs
   */
  async close(): Promise<void> {
    await this.worker.close();
  }

  /**
   * Get underlying BullMQ worker instance
   */
  get underlying(): Worker<JobData<T>, JobResult<R>> {
    return this.worker;
  }

  /**
   * Check if worker is currently shutting down
   */
  get shuttingDown(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Get count of currently active jobs
   */
  get activeJobCount(): number {
    return this.activeJobs.size;
  }
}

/**
 * Factory function to create a SwarmWorker
 */
export function createSwarmWorker<T = unknown, R = unknown>(
  config: SwarmWorkerConfig,
  processor: SandboxedJobProcessor<T, R>
): SwarmWorker<T, R> {
  return new SwarmWorker(config, processor);
}
