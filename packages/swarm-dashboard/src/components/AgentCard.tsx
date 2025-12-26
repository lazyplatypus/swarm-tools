/**
 * Individual agent card component
 * 
 * Displays agent name, status indicator, current task, and last active time
 * Uses WebTUI theme variables for consistent dark/light mode support
 */

interface AgentCardProps {
  name: string;
  status: "active" | "idle";
  lastActiveTime: number;
  currentTask?: string;
}

/**
 * Format relative time (e.g., "2 min ago", "1 hour ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} min ago`;
  return "just now";
}

export function AgentCard({
  name,
  status,
  lastActiveTime,
  currentTask,
}: AgentCardProps) {
  const isActive = status === "active";
  
  return (
    <div
      style={{
        backgroundColor: isActive ? "var(--surface0, #313244)" : "transparent",
        border: `1px solid ${isActive ? "var(--surface1, #45475a)" : "var(--surface0, #313244)"}`,
        borderRadius: "0.375rem",
        padding: "0.75rem",
        transition: "background-color 0.2s, border-color 0.2s",
      }}
    >
      {/* Agent name and status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: currentTask ? "0.5rem" : 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              height: "0.5rem",
              width: "0.5rem",
              borderRadius: "50%",
              backgroundColor: isActive ? "var(--green, #a6e3a1)" : "var(--overlay2, #9399b2)",
            }}
            data-testid="status-indicator"
            title={isActive ? "Active" : "Idle"}
          />
          <span
            style={{
              fontSize: "0.875rem",
              fontWeight: 500,
              // WCAG AA: Use --text for active (11.4:1), --subtext0 for idle (6.8:1)
              color: isActive ? "var(--text, #cdd6f4)" : "var(--subtext0, #a6adc8)",
            }}
          >
            {name}
          </span>
        </div>
        <span
          style={{
            fontSize: "0.75rem",
            // WCAG AA: --subtext0 gives 6.8:1 contrast on dark bg
            color: "var(--subtext0, #a6adc8)",
            fontFamily: "monospace",
          }}
        >
          {formatRelativeTime(lastActiveTime)}
        </span>
      </div>

      {/* Current task */}
      {currentTask && (
        <p
          style={{
            fontSize: "0.75rem",
            // WCAG AA: --subtext1 gives 8.9:1 contrast
            color: "var(--subtext1, #bac2de)",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            paddingLeft: "1rem",
          }}
        >
          {currentTask}
        </p>
      )}
    </div>
  );
}
