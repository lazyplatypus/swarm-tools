/**
 * Event Types for Swarm Mail Event Sourcing
 *
 * All agent coordination operations are represented as immutable events.
 * Current state is computed by replaying events (projections).
 *
 * Event sourcing benefits:
 * - Full audit trail for debugging
 * - Replay from any point
 * - Events ARE the training data for learning
 * - No lost messages - append-only, durable
 */
import { z } from "zod";

// ============================================================================
// Base Event Schema
// ============================================================================

/**
 * Base fields present on all events
 */
export const BaseEventSchema = z.object({
  /** Auto-generated event ID */
  id: z.number().optional(),
  /** Event type discriminator */
  type: z.string(),
  /** Project key (usually absolute path) */
  project_key: z.string(),
  /** Timestamp when event occurred */
  timestamp: z.number(), // Unix ms
  /** Sequence number for ordering */
  sequence: z.number().optional(),
});

// ============================================================================
// Agent Events
// ============================================================================

export const AgentRegisteredEventSchema = BaseEventSchema.extend({
  type: z.literal("agent_registered"),
  agent_name: z.string(),
  program: z.string().default("opencode"),
  model: z.string().default("unknown"),
  task_description: z.string().optional(),
});

export const AgentActiveEventSchema = BaseEventSchema.extend({
  type: z.literal("agent_active"),
  agent_name: z.string(),
});

// ============================================================================
// Message Events
// ============================================================================

export const MessageSentEventSchema = BaseEventSchema.extend({
  type: z.literal("message_sent"),
  /** Message ID (auto-generated) */
  message_id: z.number().optional(),
  from_agent: z.string(),
  to_agents: z.array(z.string()),
  subject: z.string(),
  body: z.string(),
  thread_id: z.string().optional(),
  importance: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  ack_required: z.boolean().default(false),
  // Thread context enrichment for observability
  epic_id: z.string().optional(),
  bead_id: z.string().optional(),
  message_type: z.enum(["progress", "blocked", "question", "status", "general"]).optional(),
  body_length: z.number().optional(),
  recipient_count: z.number().optional(),
  is_broadcast: z.boolean().optional(),
});

export const MessageReadEventSchema = BaseEventSchema.extend({
  type: z.literal("message_read"),
  message_id: z.number(),
  agent_name: z.string(),
});

export const MessageAckedEventSchema = BaseEventSchema.extend({
  type: z.literal("message_acked"),
  message_id: z.number(),
  agent_name: z.string(),
});

export const ThreadCreatedEventSchema = BaseEventSchema.extend({
  type: z.literal("thread_created"),
  thread_id: z.string(),
  epic_id: z.string().optional(),
  initial_subject: z.string(),
  creator_agent: z.string(),
});

export const ThreadActivityEventSchema = BaseEventSchema.extend({
  type: z.literal("thread_activity"),
  thread_id: z.string(),
  message_count: z.number().int().min(0),
  participant_count: z.number().int().min(0),
  last_message_agent: z.string(),
  has_unread: z.boolean(),
});

// ============================================================================
// File Reservation Events
// ============================================================================

export const FileReservedEventSchema = BaseEventSchema.extend({
  type: z.literal("file_reserved"),
  /** Reservation ID (auto-generated) */
  reservation_id: z.number().optional(),
  agent_name: z.string(),
  paths: z.array(z.string()),
  reason: z.string().optional(),
  exclusive: z.boolean().default(true),
  /** TTL in seconds */
  ttl_seconds: z.number().default(3600),
  /** Absolute expiry timestamp */
  expires_at: z.number(),
  /** DurableLock holder IDs (one per path) */
  lock_holder_ids: z.array(z.string()).optional(),
  /** Epic ID if part of swarm work */
  epic_id: z.string().optional(),
  /** Cell/bead ID if part of swarm work */
  bead_id: z.string().optional(),
  /** Number of files being reserved */
  file_count: z.number().optional(),
  /** Whether this is a retry after conflict */
  is_retry: z.boolean().optional(),
  /** Agent that caused a conflict (if any) */
  conflict_agent: z.string().optional(),
});

export const FileReleasedEventSchema = BaseEventSchema.extend({
  type: z.literal("file_released"),
  agent_name: z.string(),
  /** Specific paths to release, or empty to release all */
  paths: z.array(z.string()).optional(),
  /** Specific reservation IDs to release */
  reservation_ids: z.array(z.number()).optional(),
  /** DurableLock holder IDs to release */
  lock_holder_ids: z.array(z.string()).optional(),
  /** Epic ID if part of swarm work */
  epic_id: z.string().optional(),
  /** Cell/bead ID if part of swarm work */
  bead_id: z.string().optional(),
  /** Number of files being released */
  file_count: z.number().optional(),
  /** How long files were held (milliseconds) */
  hold_duration_ms: z.number().optional(),
  /** How many files were actually modified */
  files_modified: z.number().optional(),
});

export const FileConflictEventSchema = BaseEventSchema.extend({
  type: z.literal("file_conflict"),
  /** Agent requesting the files */
  requesting_agent: z.string(),
  /** Agent currently holding the files */
  holding_agent: z.string(),
  /** Paths that are in conflict */
  paths: z.array(z.string()),
  /** Epic ID if part of swarm work */
  epic_id: z.string().optional(),
  /** Cell/bead ID if part of swarm work */
  bead_id: z.string().optional(),
  /** How the conflict was resolved */
  resolution: z.enum(["wait", "force", "abort"]).optional(),
});

// ============================================================================
// Task Events (for swarm integration)
// ============================================================================

export const TaskStartedEventSchema = BaseEventSchema.extend({
  type: z.literal("task_started"),
  agent_name: z.string(),
  bead_id: z.string(),
  epic_id: z.string().optional(),
});

export const TaskProgressEventSchema = BaseEventSchema.extend({
  type: z.literal("task_progress"),
  agent_name: z.string(),
  bead_id: z.string(),
  progress_percent: z.number().min(0).max(100).optional(),
  message: z.string().optional(),
  files_touched: z.array(z.string()).optional(),
});

export const TaskCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal("task_completed"),
  agent_name: z.string(),
  bead_id: z.string(),
  summary: z.string(),
  files_touched: z.array(z.string()).optional(),
  success: z.boolean().default(true),
});

export const TaskBlockedEventSchema = BaseEventSchema.extend({
  type: z.literal("task_blocked"),
  agent_name: z.string(),
  bead_id: z.string(),
  reason: z.string(),
});

// ============================================================================
// Eval Capture Events (for learning system)
// ============================================================================

export const DecompositionGeneratedEventSchema = BaseEventSchema.extend({
  type: z.literal("decomposition_generated"),
  epic_id: z.string(),
  task: z.string(),
  context: z.string().optional(),
  strategy: z.enum(["file-based", "feature-based", "risk-based"]),
  epic_title: z.string(),
  subtasks: z.array(
    z.object({
      title: z.string(),
      files: z.array(z.string()),
      priority: z.number().min(0).max(3).optional(),
    }),
  ),
  recovery_context: z
    .object({
      shared_context: z.string().optional(),
      skills_to_load: z.array(z.string()).optional(),
      coordinator_notes: z.string().optional(),
    })
    .optional(),
});

export const SubtaskOutcomeEventSchema = BaseEventSchema.extend({
  type: z.literal("subtask_outcome"),
  epic_id: z.string(),
  bead_id: z.string(),
  planned_files: z.array(z.string()),
  actual_files: z.array(z.string()),
  duration_ms: z.number().min(0),
  error_count: z.number().min(0).default(0),
  retry_count: z.number().min(0).default(0),
  success: z.boolean(),
  /** Contract violation - files touched outside owned scope */
  scope_violation: z.boolean().optional(),
  /** Files that violated the contract */
  violation_files: z.array(z.string()).optional(),
});

export const HumanFeedbackEventSchema = BaseEventSchema.extend({
  type: z.literal("human_feedback"),
  epic_id: z.string(),
  accepted: z.boolean(),
  modified: z.boolean().default(false),
  notes: z.string().optional(),
});

// ============================================================================
// Swarm Checkpoint Events (for recovery and coordination)
// ============================================================================

export const SwarmCheckpointedEventSchema = BaseEventSchema.extend({
  type: z.literal("swarm_checkpointed"),
  epic_id: z.string(),
  bead_id: z.string(),
  strategy: z.enum(["file-based", "feature-based", "risk-based"]),
  files: z.array(z.string()),
  dependencies: z.array(z.string()),
  directives: z.object({
    shared_context: z.string().optional(),
    skills_to_load: z.array(z.string()).optional(),
    coordinator_notes: z.string().optional(),
  }),
  recovery: z.object({
    last_checkpoint: z.number(),
    files_modified: z.array(z.string()),
    progress_percent: z.number().min(0).max(100),
    last_message: z.string().optional(),
    error_context: z.string().optional(),
  }),
  // Enhanced observability fields
  checkpoint_size_bytes: z.number().int().min(0).optional(),
  trigger: z.enum(["manual", "auto", "progress", "error"]).optional(),
  context_tokens_before: z.number().int().min(0).optional(),
  context_tokens_after: z.number().int().min(0).optional(),
});

export const SwarmRecoveredEventSchema = BaseEventSchema.extend({
  type: z.literal("swarm_recovered"),
  epic_id: z.string(),
  bead_id: z.string(),
  recovered_from_checkpoint: z.number(), // timestamp
  // Enhanced observability fields
  recovery_duration_ms: z.number().int().min(0).optional(),
  checkpoint_age_ms: z.number().int().min(0).optional(),
  files_restored: z.array(z.string()).optional(),
  context_restored_tokens: z.number().int().min(0).optional(),
});

export const CheckpointCreatedEventSchema = BaseEventSchema.extend({
  type: z.literal("checkpoint_created"),
  epic_id: z.string(),
  bead_id: z.string(),
  agent_name: z.string(),
  checkpoint_id: z.string(),
  trigger: z.enum(["manual", "auto", "progress", "error"]),
  progress_percent: z.number().min(0).max(100),
  files_snapshot: z.array(z.string()),
});

export const ContextCompactedEventSchema = BaseEventSchema.extend({
  type: z.literal("context_compacted"),
  epic_id: z.string().optional(),
  bead_id: z.string().optional(),
  agent_name: z.string(),
  tokens_before: z.number().int().min(0),
  tokens_after: z.number().int().min(0),
  compression_ratio: z.number().min(0).max(1),
  summary_length: z.number().int().min(0),
});

// ============================================================================
// Swarm Lifecycle Events
// ============================================================================

export const SwarmStartedEventSchema = BaseEventSchema.extend({
  type: z.literal("swarm_started"),
  epic_id: z.string(),
  epic_title: z.string(),
  strategy: z.enum(["file-based", "feature-based", "risk-based"]),
  subtask_count: z.number().int().min(0),
  total_files: z.number().int().min(0),
  coordinator_agent: z.string(),
});

export const WorkerSpawnedEventSchema = BaseEventSchema.extend({
  type: z.literal("worker_spawned"),
  epic_id: z.string(),
  bead_id: z.string(),
  worker_agent: z.string(),
  subtask_title: z.string(),
  files_assigned: z.array(z.string()),
  spawn_order: z.number().int().min(0),
  is_parallel: z.boolean(),
});

export const WorkerCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal("worker_completed"),
  epic_id: z.string(),
  bead_id: z.string(),
  worker_agent: z.string(),
  success: z.boolean(),
  duration_ms: z.number().int().min(0),
  files_touched: z.array(z.string()),
  error_message: z.string().optional(),
});

export const ReviewStartedEventSchema = BaseEventSchema.extend({
  type: z.literal("review_started"),
  epic_id: z.string(),
  bead_id: z.string(),
  attempt: z.number().int().min(1),
});

export const ReviewCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal("review_completed"),
  epic_id: z.string(),
  bead_id: z.string(),
  status: z.enum(["approved", "needs_changes", "blocked"]),
  attempt: z.number().int().min(1),
  duration_ms: z.number().int().min(0).optional(),
});

export const SwarmCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal("swarm_completed"),
  epic_id: z.string(),
  epic_title: z.string(),
  success: z.boolean(),
  total_duration_ms: z.number().int().min(0),
  subtasks_completed: z.number().int().min(0),
  subtasks_failed: z.number().int().min(0),
  total_files_touched: z.array(z.string()),
});

// ============================================================================
// Union Type
// ============================================================================

export const AgentEventSchema = z.discriminatedUnion("type", [
  AgentRegisteredEventSchema,
  AgentActiveEventSchema,
  MessageSentEventSchema,
  MessageReadEventSchema,
  MessageAckedEventSchema,
  ThreadCreatedEventSchema,
  ThreadActivityEventSchema,
  FileReservedEventSchema,
  FileReleasedEventSchema,
  FileConflictEventSchema,
  TaskStartedEventSchema,
  TaskProgressEventSchema,
  TaskCompletedEventSchema,
  TaskBlockedEventSchema,
  DecompositionGeneratedEventSchema,
  SubtaskOutcomeEventSchema,
  HumanFeedbackEventSchema,
  SwarmCheckpointedEventSchema,
  SwarmRecoveredEventSchema,
  CheckpointCreatedEventSchema,
  ContextCompactedEventSchema,
  SwarmStartedEventSchema,
  WorkerSpawnedEventSchema,
  WorkerCompletedEventSchema,
  ReviewStartedEventSchema,
  ReviewCompletedEventSchema,
  SwarmCompletedEventSchema,
]);

export type AgentEvent = z.infer<typeof AgentEventSchema>;

// Individual event types for convenience
export type AgentRegisteredEvent = z.infer<typeof AgentRegisteredEventSchema>;
export type AgentActiveEvent = z.infer<typeof AgentActiveEventSchema>;
export type MessageSentEvent = z.infer<typeof MessageSentEventSchema>;
export type MessageReadEvent = z.infer<typeof MessageReadEventSchema>;
export type MessageAckedEvent = z.infer<typeof MessageAckedEventSchema>;
export type ThreadCreatedEvent = z.infer<typeof ThreadCreatedEventSchema>;
export type ThreadActivityEvent = z.infer<typeof ThreadActivityEventSchema>;
export type FileReservedEvent = z.infer<typeof FileReservedEventSchema>;
export type FileReleasedEvent = z.infer<typeof FileReleasedEventSchema>;
export type FileConflictEvent = z.infer<typeof FileConflictEventSchema>;
export type TaskStartedEvent = z.infer<typeof TaskStartedEventSchema>;
export type TaskProgressEvent = z.infer<typeof TaskProgressEventSchema>;
export type TaskCompletedEvent = z.infer<typeof TaskCompletedEventSchema>;
export type TaskBlockedEvent = z.infer<typeof TaskBlockedEventSchema>;
export type DecompositionGeneratedEvent = z.infer<
  typeof DecompositionGeneratedEventSchema
>;
export type SubtaskOutcomeEvent = z.infer<typeof SubtaskOutcomeEventSchema>;
export type HumanFeedbackEvent = z.infer<typeof HumanFeedbackEventSchema>;
export type SwarmCheckpointedEvent = z.infer<
  typeof SwarmCheckpointedEventSchema
>;
export type SwarmRecoveredEvent = z.infer<typeof SwarmRecoveredEventSchema>;
export type CheckpointCreatedEvent = z.infer<typeof CheckpointCreatedEventSchema>;
export type ContextCompactedEvent = z.infer<typeof ContextCompactedEventSchema>;
export type SwarmStartedEvent = z.infer<typeof SwarmStartedEventSchema>;
export type WorkerSpawnedEvent = z.infer<typeof WorkerSpawnedEventSchema>;
export type WorkerCompletedEvent = z.infer<typeof WorkerCompletedEventSchema>;
export type ReviewStartedEvent = z.infer<typeof ReviewStartedEventSchema>;
export type ReviewCompletedEvent = z.infer<typeof ReviewCompletedEventSchema>;
export type SwarmCompletedEvent = z.infer<typeof SwarmCompletedEventSchema>;

// ============================================================================
// Session State Types
// ============================================================================

/**
 * Shared session state for Agent Mail and Swarm Mail
 *
 * Common fields for tracking agent coordination session across both
 * the MCP-based implementation (agent-mail) and the embedded event-sourced
 * implementation (swarm-mail).
 */
export interface MailSessionState {
  /** Project key (usually absolute path) */
  projectKey: string;
  /** Agent name for this session */
  agentName: string;
  /** Active reservation IDs */
  reservations: number[];
  /** Session start timestamp (ISO-8601) */
  startedAt: string;
}

// ============================================================================
// Event Helpers
// ============================================================================

/**
 * Create an event with timestamp and validate
 */
export function createEvent<T extends AgentEvent["type"]>(
  type: T,
  data: Omit<
    Extract<AgentEvent, { type: T }>,
    "type" | "timestamp" | "id" | "sequence"
  >,
): Extract<AgentEvent, { type: T }> {
  const event = {
    type,
    timestamp: Date.now(),
    ...data,
  } as Extract<AgentEvent, { type: T }>;

  // Validate
  const result = AgentEventSchema.safeParse(event);
  if (!result.success) {
    throw new Error(`Invalid event: ${result.error.message}`);
  }

  return result.data as Extract<AgentEvent, { type: T }>;
}

/**
 * Type guard for specific event types
 */
export function isEventType<T extends AgentEvent["type"]>(
  event: AgentEvent,
  type: T,
): event is Extract<AgentEvent, { type: T }> {
  return event.type === type;
}
