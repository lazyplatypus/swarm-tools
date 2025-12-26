/**
 * Events pane with live event stream
 * 
 * Features:
 * - Scrollable list with newest at TOP (reverse chronological)
 * - Color-coded event type badges (Catppuccin palette)
 * - Filter by event type
 * - Event count display
 */

import { useMemo, useState } from "react";
import { EventRow } from "./EventRow";
import type { AgentEvent } from "../lib/types";

interface EventsPaneProps {
  /** Events to display */
  events: AgentEvent[];
  /** Initial event type filter (optional) */
  initialFilter?: AgentEvent["type"] | "all";
}

type EventFilter = AgentEvent["type"] | "all";

export function EventsPane({ events, initialFilter = "all" }: EventsPaneProps) {
  const [filter, setFilter] = useState<EventFilter>(initialFilter);

  // Filter and reverse events (newest first)
  const filteredEvents = useMemo(() => {
    const filtered = events.filter((event) => {
      if (filter === "all") return true;
      if (filter === event.type) return true;
      // Category prefix matching
      if (filter.startsWith("agent_") && event.type.startsWith("agent_")) return true;
      if (filter.startsWith("task_") && event.type.startsWith("task_")) return true;
      if (filter.startsWith("message_") && event.type.startsWith("message_")) return true;
      if (filter.startsWith("file_") && event.type.startsWith("file_")) return true;
      return false;
    });
    // Reverse to show newest first
    return [...filtered].reverse();
  }, [events, filter]);

  const eventCount = filteredEvents.length;

  // Filter button style helper
  const getFilterButtonStyle = (isActive: boolean, color: string) => ({
    padding: "0.25rem 0.75rem",
    fontSize: "0.75rem",
    fontWeight: 500,
    borderRadius: "0.25rem",
    border: "none",
    cursor: "pointer",
    transition: "background-color 0.2s",
    backgroundColor: isActive ? color : "var(--surface0, #313244)",
    color: isActive ? "var(--base, #1e1e2e)" : "var(--foreground1)",
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--background1)",
        borderRadius: "0.5rem",
        border: "1px solid var(--surface0, #313244)",
        overflow: "hidden",
      }}
    >
      {/* Header with filters */}
      <div
        style={{
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--surface0, #313244)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.75rem",
          }}
        >
          <h2
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              color: "var(--foreground0)",
              margin: 0,
            }}
          >
            Events
          </h2>
          <span style={{ fontSize: "0.875rem", color: "var(--foreground2)" }}>
            {eventCount} {eventCount === 1 ? "event" : "events"}
          </span>
        </div>

        {/* Filter buttons */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setFilter("all")}
            style={getFilterButtonStyle(filter === "all", "var(--foreground0)")}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter("agent_registered")}
            style={getFilterButtonStyle(
              filter === "agent_registered" || filter === "agent_active",
              "var(--sapphire, #74c7ec)"
            )}
          >
            Agent
          </button>
          <button
            type="button"
            onClick={() => setFilter("task_started")}
            style={getFilterButtonStyle(
              filter.startsWith("task_"),
              "var(--green, #a6e3a1)"
            )}
          >
            Task
          </button>
          <button
            type="button"
            onClick={() => setFilter("message_sent")}
            style={getFilterButtonStyle(
              filter.startsWith("message_"),
              "var(--mauve, #cba6f7)"
            )}
          >
            Message
          </button>
          <button
            type="button"
            onClick={() => setFilter("file_reserved")}
            style={getFilterButtonStyle(
              filter.startsWith("file_"),
              "var(--overlay0, #6c7086)"
            )}
          >
            File
          </button>
        </div>
      </div>

      {/* Scrollable event list - newest at top */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filteredEvents.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--foreground2)",
            }}
          >
            <p>No events yet</p>
          </div>
        ) : (
          <div>
            {filteredEvents.map((event, index) => (
              <EventRow
                key={event.id || `${event.type}-${event.timestamp}-${index}`}
                event={event}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
