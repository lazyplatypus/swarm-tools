/**
 * Queue Event Types for Swarm Mail Integration
 *
 * Defines events emitted during job lifecycle to enable
 * agent coordination and monitoring via swarm-mail.
 */

import type { JobData, JobResult } from "./types";

/**
 * Queue event types
 */
export type QueueEventType =
  | "job_submitted"
  | "job_started"
  | "job_completed"
  | "job_failed"
  | "job_progress"
  | "job_stalled";

/**
 * Base queue event payload
 */
export interface BaseQueueEvent {
  type: QueueEventType;
  jobId: string;
  timestamp: number;
  queueName: string;
}

/**
 * Job submitted event - emitted when job is added to queue
 */
export interface JobSubmittedEvent extends BaseQueueEvent {
  type: "job_submitted";
  jobType: string;
  priority?: number;
  delay?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Job started event - emitted when worker picks up job
 */
export interface JobStartedEvent extends BaseQueueEvent {
  type: "job_started";
  jobType: string;
  attemptNumber: number;
  workerName?: string;
}

/**
 * Job completed event - emitted when job succeeds
 */
export interface JobCompletedEvent extends BaseQueueEvent {
  type: "job_completed";
  jobType: string;
  durationMs: number;
  result?: unknown;
  attemptNumber: number;
}

/**
 * Job failed event - emitted when job fails
 */
export interface JobFailedEvent extends BaseQueueEvent {
  type: "job_failed";
  jobType: string;
  error: string;
  attemptNumber: number;
  willRetry: boolean;
  maxAttempts?: number;
}

/**
 * Job progress event - emitted when job reports progress
 */
export interface JobProgressEvent extends BaseQueueEvent {
  type: "job_progress";
  jobType: string;
  progress: unknown;
  stage?: string;
  percent?: number;
}

/**
 * Job stalled event - emitted when job is detected as stalled
 */
export interface JobStalledEvent extends BaseQueueEvent {
  type: "job_stalled";
  jobType: string;
  stalledCount: number;
}

/**
 * Union of all queue event types
 */
export type QueueEvent =
  | JobSubmittedEvent
  | JobStartedEvent
  | JobCompletedEvent
  | JobFailedEvent
  | JobProgressEvent
  | JobStalledEvent;

/**
 * Event handler function type
 */
export type QueueEventHandler = (event: QueueEvent) => void | Promise<void>;

/**
 * Event emitter interface for queue events
 */
export interface QueueEventEmitter {
  /**
   * Register an event handler
   */
  on(handler: QueueEventHandler): void;

  /**
   * Unregister an event handler
   */
  off(handler: QueueEventHandler): void;

  /**
   * Emit an event to all handlers
   */
  emit(event: QueueEvent): Promise<void>;
}

/**
 * Create a queue event with timestamp
 */
export function createQueueEvent<T extends QueueEventType>(
  type: T,
  data: Omit<Extract<QueueEvent, { type: T }>, "type" | "timestamp">
): Extract<QueueEvent, { type: T }> {
  return {
    type,
    timestamp: Date.now(),
    ...data,
  } as Extract<QueueEvent, { type: T }>;
}

/**
 * Type guard for specific event types
 */
export function isQueueEventType<T extends QueueEventType>(
  event: QueueEvent,
  type: T
): event is Extract<QueueEvent, { type: T }> {
  return event.type === type;
}
