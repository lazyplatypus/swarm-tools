/**
 * Individual event row component
 * 
 * Displays a single event with timestamp, type badge, agent name, and summary
 * Uses WebTUI/Catppuccin theme variables for dark/light mode
 */

import type { AgentEvent } from "../lib/types";

interface EventRowProps {
  event: AgentEvent;
}

/**
 * Format timestamp as HH:MM:SS
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Get badge colors based on event type using Catppuccin palette
 */
function getBadgeColors(eventType: AgentEvent["type"]): { bg: string; text: string } {
  const colorMap: Record<string, { bg: string; text: string }> = {
    // Agent events - Blue/Sapphire
    agent_registered: { bg: "var(--sapphire, #74c7ec)", text: "var(--base, #1e1e2e)" },
    agent_active: { bg: "var(--sapphire, #74c7ec)", text: "var(--base, #1e1e2e)" },

    // Task completion - Green
    task_completed: { bg: "var(--green, #a6e3a1)", text: "var(--base, #1e1e2e)" },

    // Task start/progress - Yellow/Peach
    task_started: { bg: "var(--peach, #fab387)", text: "var(--base, #1e1e2e)" },
    task_progress: { bg: "var(--yellow, #f9e2af)", text: "var(--base, #1e1e2e)" },

    // Task blocked - Red
    task_blocked: { bg: "var(--red, #f38ba8)", text: "var(--base, #1e1e2e)" },

    // Messages - Mauve/Purple
    message_sent: { bg: "var(--mauve, #cba6f7)", text: "var(--base, #1e1e2e)" },
    message_read: { bg: "var(--mauve, #cba6f7)", text: "var(--base, #1e1e2e)" },
    message_acked: { bg: "var(--lavender, #b4befe)", text: "var(--base, #1e1e2e)" },

    // File operations - Overlay
    file_reserved: { bg: "var(--surface2, #585b70)", text: "var(--text, #cdd6f4)" },
    file_released: { bg: "var(--surface1, #45475a)", text: "var(--text, #cdd6f4)" },

    // Decomposition/outcomes - Teal
    decomposition_generated: { bg: "var(--teal, #94e2d5)", text: "var(--base, #1e1e2e)" },
    subtask_outcome: { bg: "var(--sky, #89dceb)", text: "var(--base, #1e1e2e)" },

    // Checkpoints - Blue
    swarm_checkpointed: { bg: "var(--blue, #89b4fa)", text: "var(--base, #1e1e2e)" },
    swarm_recovered: { bg: "var(--blue, #89b4fa)", text: "var(--base, #1e1e2e)" },

    // Human feedback - Flamingo
    human_feedback: { bg: "var(--flamingo, #f2cdcd)", text: "var(--base, #1e1e2e)" },

    // Cell events - Rosewater/Pink
    cell_created: { bg: "var(--rosewater, #f5e0dc)", text: "var(--base, #1e1e2e)" },
    cell_updated: { bg: "var(--pink, #f5c2e7)", text: "var(--base, #1e1e2e)" },
    cell_status_changed: { bg: "var(--pink, #f5c2e7)", text: "var(--base, #1e1e2e)" },
    cell_closed: { bg: "var(--maroon, #eba0ac)", text: "var(--base, #1e1e2e)" },
  };

  return colorMap[eventType] || { bg: "var(--surface1, #45475a)", text: "var(--text, #cdd6f4)" };
}

/**
 * Extract display summary from event
 */
function getEventSummary(event: AgentEvent): string {
  switch (event.type) {
    case "agent_registered":
      return event.model ? `Registered with ${event.model}` : "Registered";
    case "agent_active":
      return "Agent active";
    case "task_started":
      return `Started ${event.bead_id}`;
    case "task_progress":
      return event.message || `Progress: ${event.progress_percent}%`;
    case "task_completed":
      return event.summary || "Task completed";
    case "task_blocked":
      return event.reason || "Task blocked";
    case "message_sent":
      return `To ${event.to_agents.join(", ")}: ${event.subject}`;
    case "message_read":
      return `Read message ${event.message_id}`;
    case "message_acked":
      return `Acknowledged message ${event.message_id}`;
    case "file_reserved":
      return `Reserved ${event.paths.length} file(s)`;
    case "file_released":
      return event.paths
        ? `Released ${event.paths.length} file(s)`
        : "Released reservations";
    case "decomposition_generated":
      return `Decomposed: ${event.epic_title} (${event.subtasks.length} subtasks)`;
    case "subtask_outcome":
      return `Subtask ${event.success ? "succeeded" : "failed"} (${event.duration_ms}ms)`;
    case "human_feedback":
      return event.accepted ? "Feedback: Accepted" : "Feedback: Rejected";
    case "swarm_checkpointed":
      return `Checkpoint created for ${event.bead_id}`;
    case "swarm_recovered":
      return `Recovered ${event.bead_id}`;
    case "cell_created":
      return `Created: ${event.title}`;
    case "cell_updated":
      return `Updated: ${event.cell_id}`;
    case "cell_status_changed":
      return `Status: ${event.from_status} → ${event.to_status}`;
    case "cell_closed":
      return event.reason ? `Closed: ${event.reason}` : "Closed";
    case "swarm_started":
      return `Swarm started: ${event.epic_title} (${event.subtask_count} subtasks, ${event.total_files} files)`;
    case "worker_spawned":
      return `Worker spawned: ${event.worker_agent} for ${event.subtask_title}`;
    case "worker_completed":
      return event.success
        ? `Worker completed: ${event.worker_agent} (${event.duration_ms}ms)`
        : `Worker failed: ${event.worker_agent} - ${event.error_message || "unknown error"}`;
    case "review_started":
      return `Review started: ${event.bead_id} (attempt ${event.attempt})`;
    case "review_completed":
      return `Review ${event.status}: ${event.bead_id} (attempt ${event.attempt})`;
    case "swarm_completed":
      return event.success
        ? `Swarm completed: ${event.epic_title} (${event.subtasks_completed} completed, ${event.total_duration_ms}ms)`
        : `Swarm failed: ${event.epic_title} (${event.subtasks_failed} failed)`;
    default: {
      const _exhaustive: never = event;
      return String(_exhaustive);
    }
  }
}

/**
 * Get agent name from event
 */
function getAgentName(event: AgentEvent): string | undefined {
  if ("agent_name" in event && typeof event.agent_name === "string") {
    return event.agent_name;
  }
  if ("from_agent" in event && typeof event.from_agent === "string") {
    return event.from_agent;
  }
  return undefined;
}

export function EventRow({ event }: EventRowProps) {
  const agentName = getAgentName(event);
  const summary = getEventSummary(event);
  const badgeColors = getBadgeColors(event.type);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.75rem",
        padding: "0.5rem 1rem",
        borderBottom: "1px solid var(--surface0, #313244)",
        fontSize: "0.875rem",
      }}
    >
      {/* Timestamp */}
      <div
        style={{
          fontSize: "0.75rem",
          color: "var(--foreground2)",
          fontFamily: "monospace",
          width: "5rem",
          flexShrink: 0,
          paddingTop: "0.125rem",
        }}
      >
        {formatTime(event.timestamp)}
      </div>

      {/* Event type badge */}
      <div style={{ flexShrink: 0 }}>
        <span
          style={{
            padding: "0.125rem 0.5rem",
            fontSize: "0.75rem",
            fontWeight: 500,
            borderRadius: "0.25rem",
            backgroundColor: badgeColors.bg,
            color: badgeColors.text,
          }}
        >
          {event.type}
        </span>
      </div>

      {/* Agent name */}
      {agentName && (
        <div
          style={{
            color: "var(--foreground0)",
            fontWeight: 500,
            width: "8rem",
            flexShrink: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            paddingTop: "0.125rem",
          }}
        >
          {agentName}
        </div>
      )}

      {/* Summary */}
      <div
        style={{
          color: "var(--foreground1)",
          flex: 1,
          paddingTop: "0.125rem",
          wordBreak: "break-word",
        }}
      >
        {summary}
      </div>
    </div>
  );
}
