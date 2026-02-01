/**
 * Queue Notifications - Swarm Mail Integration
 *
 * Sends queue events to swarm-mail for agent coordination.
 * Enables agents to receive notifications about job lifecycle.
 */

import type { Job as BullJob } from "bullmq";
import type { JobData } from "./types";
import type { QueueEvent, QueueEventHandler } from "./events";
import { createQueueEvent } from "./events";

/**
 * Notification target - agents to notify
 */
export interface NotificationTarget {
  /**
   * Agent names to notify
   */
  agents: string[];

  /**
   * Event types to notify about (empty = all events)
   */
  eventTypes?: QueueEvent["type"][];
}

/**
 * Notifier configuration
 */
export interface QueueNotifierConfig {
  /**
   * Queue name
   */
  queueName: string;

  /**
   * Project key for swarm-mail events
   */
  projectKey: string;

  /**
   * Default notification targets
   */
  targets?: NotificationTarget[];

  /**
   * Custom event handler for advanced use cases
   */
  customHandler?: QueueEventHandler;
}

/**
 * Queue notifier - emits swarm-mail events for job lifecycle
 *
 * Usage:
 * ```typescript
 * const notifier = new QueueNotifier({
 *   queueName: "tasks",
 *   projectKey: "/path/to/project",
 *   targets: [{ agents: ["coordinator"], eventTypes: ["job_failed"] }]
 * });
 *
 * // Hook into queue/worker events
 * queue.on("added", (job) => notifier.onJobSubmitted(job));
 * worker.on("active", (job) => notifier.onJobStarted(job));
 * worker.on("completed", (job, result) => notifier.onJobCompleted(job, result));
 * worker.on("failed", (job, error) => notifier.onJobFailed(job, error));
 * ```
 */
export class QueueNotifier {
  private config: QueueNotifierConfig;
  private handlers: Set<QueueEventHandler> = new Set();

  constructor(config: QueueNotifierConfig) {
    this.config = config;
    if (config.customHandler) {
      this.handlers.add(config.customHandler);
    }
  }

  /**
   * Register an event handler
   */
  on(handler: QueueEventHandler): void {
    this.handlers.add(handler);
  }

  /**
   * Unregister an event handler
   */
  off(handler: QueueEventHandler): void {
    this.handlers.delete(handler);
  }

  /**
   * Emit event to all handlers
   */
  private async emit(event: QueueEvent): Promise<void> {
    const promises = Array.from(this.handlers).map(async (handler) => {
      try {
        await handler(event);
      } catch (error) {
        console.error("[QueueNotifier] Handler error:", error);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Check if event should be sent to targets
   */
  private shouldNotify(eventType: QueueEvent["type"]): boolean {
    if (!this.config.targets || this.config.targets.length === 0) {
      return true; // No targets = notify all
    }

    return this.config.targets.some((target) => {
      if (!target.eventTypes || target.eventTypes.length === 0) {
        return true; // No event filter = all events
      }
      return target.eventTypes.includes(eventType);
    });
  }

  /**
   * Handle job submitted (added to queue)
   */
  async onJobSubmitted<T>(job: BullJob<JobData<T>>): Promise<void> {
    const event = createQueueEvent("job_submitted", {
      jobId: job.id!,
      queueName: this.config.queueName,
      jobType: job.data.type,
      priority: job.opts.priority,
      delay: job.opts.delay,
      metadata: job.data.metadata,
    });

    if (this.shouldNotify(event.type)) {
      await this.emit(event);
    }
  }

  /**
   * Handle job started (picked up by worker)
   */
  async onJobStarted<T>(job: BullJob<JobData<T>>, workerName?: string): Promise<void> {
    const event = createQueueEvent("job_started", {
      jobId: job.id!,
      queueName: this.config.queueName,
      jobType: job.data.type,
      attemptNumber: job.attemptsMade + 1,
      workerName,
    });

    if (this.shouldNotify(event.type)) {
      await this.emit(event);
    }
  }

  /**
   * Handle job completed (successfully finished)
   */
  async onJobCompleted<T, R>(
    job: BullJob<JobData<T>>,
    result: R,
    startTime: number
  ): Promise<void> {
    const event = createQueueEvent("job_completed", {
      jobId: job.id!,
      queueName: this.config.queueName,
      jobType: job.data.type,
      durationMs: Date.now() - startTime,
      result,
      attemptNumber: job.attemptsMade + 1,
    });

    if (this.shouldNotify(event.type)) {
      await this.emit(event);
    }
  }

  /**
   * Handle job failed
   */
  async onJobFailed<T>(
    job: BullJob<JobData<T>>,
    error: Error | string
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const maxAttempts = job.opts.attempts || 1;
    const willRetry = job.attemptsMade + 1 < maxAttempts;

    const event = createQueueEvent("job_failed", {
      jobId: job.id!,
      queueName: this.config.queueName,
      jobType: job.data.type,
      error: errorMessage,
      attemptNumber: job.attemptsMade + 1,
      willRetry,
      maxAttempts,
    });

    if (this.shouldNotify(event.type)) {
      await this.emit(event);
    }
  }

  /**
   * Handle job progress update
   */
  async onJobProgress<T>(
    job: BullJob<JobData<T>>,
    progress: unknown
  ): Promise<void> {
    // Extract stage/percent if available
    const progressData = progress as { stage?: string; percent?: number } | undefined;

    const event = createQueueEvent("job_progress", {
      jobId: job.id!,
      queueName: this.config.queueName,
      jobType: job.data.type,
      progress,
      stage: progressData?.stage,
      percent: progressData?.percent,
    });

    if (this.shouldNotify(event.type)) {
      await this.emit(event);
    }
  }

  /**
   * Handle job stalled
   */
  async onJobStalled<T>(job: BullJob<JobData<T>>): Promise<void> {
    const event = createQueueEvent("job_stalled", {
      jobId: job.id!,
      queueName: this.config.queueName,
      jobType: job.data.type,
      stalledCount: job.attemptsMade,
    });

    if (this.shouldNotify(event.type)) {
      await this.emit(event);
    }
  }

  /**
   * Get notification targets for this notifier
   */
  getTargets(): NotificationTarget[] {
    return this.config.targets || [];
  }

  /**
   * Add notification target
   */
  addTarget(target: NotificationTarget): void {
    if (!this.config.targets) {
      this.config.targets = [];
    }
    this.config.targets.push(target);
  }

  /**
   * Remove notification target by agent name
   */
  removeTarget(agentName: string): void {
    if (!this.config.targets) return;
    this.config.targets = this.config.targets.filter(
      (target) => !target.agents.includes(agentName)
    );
  }
}

/**
 * Factory function to create a notifier
 */
export function createQueueNotifier(
  config: QueueNotifierConfig
): QueueNotifier {
  return new QueueNotifier(config);
}
