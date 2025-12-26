/**
 * Agents pane component
 * 
 * Shows active agents with real-time updates via SSE.
 * Uses WebTUI theme variables for dark/light mode support.
 */

import { useMemo } from "react";
import { AgentCard } from "./AgentCard";
import type {
  AgentActiveEvent,
  AgentEvent,
  AgentRegisteredEvent,
  ConnectionState,
  TaskCompletedEvent,
  TaskProgressEvent,
  TaskStartedEvent,
} from "../lib/types";

interface Agent {
  name: string;
  status: "active" | "idle";
  lastActiveTime: number;
  currentTask?: string;
}

/**
 * Agent is considered active if last seen within 5 minutes
 */
const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000;

export interface AgentsPaneProps {
  /** Events array from useSwarmEvents or useWebSocket hook */
  events: AgentEvent[];
  /** Connection state */
  state: ConnectionState | "disconnected";
}

export function AgentsPane({ events, state }: AgentsPaneProps) {
  console.log("[AgentsPane] events:", events.length, "state:", state);
  
  // Derive agent state from events
  const agents = useMemo<Agent[]>(() => {
    console.log("[AgentsPane] Computing agents from", events.length, "events");
    // Helper to filter events by type
    const getEventsByType = <T extends AgentEvent["type"]>(type: T) => {
      return events.filter((e) => e.type === type) as Extract<
        AgentEvent,
        { type: T }
      >[];
    };
    
    // Get all agent registrations
    const registrations = getEventsByType("agent_registered") as AgentRegisteredEvent[];
    const activeEvents = getEventsByType("agent_active") as AgentActiveEvent[];
    const taskStarted = getEventsByType("task_started") as TaskStartedEvent[];
    const taskProgress = getEventsByType("task_progress") as TaskProgressEvent[];
    const taskCompleted = getEventsByType("task_completed") as TaskCompletedEvent[];

    // Build map of agent name -> agent state
    const agentMap = new Map<string, Agent>();

    // Initialize from registrations
    for (const event of registrations) {
      agentMap.set(event.agent_name, {
        name: event.agent_name,
        status: "idle",
        lastActiveTime: event.timestamp,
        currentTask: event.task_description,
      });
    }

    // Update with active pings
    for (const event of activeEvents) {
      const agent = agentMap.get(event.agent_name);
      if (agent) {
        agent.lastActiveTime = Math.max(agent.lastActiveTime, event.timestamp);
      }
    }

    // Update with task events
    for (const event of taskStarted) {
      const agent = agentMap.get(event.agent_name);
      if (agent) {
        agent.lastActiveTime = Math.max(agent.lastActiveTime, event.timestamp);
        agent.currentTask = event.bead_id;
      }
    }

    for (const event of taskProgress) {
      const agent = agentMap.get(event.agent_name);
      if (agent) {
        agent.lastActiveTime = Math.max(agent.lastActiveTime, event.timestamp);
        if (event.message) {
          agent.currentTask = event.message;
        }
      }
    }

    for (const event of taskCompleted) {
      const agent = agentMap.get(event.agent_name);
      if (agent) {
        agent.lastActiveTime = Math.max(agent.lastActiveTime, event.timestamp);
        agent.currentTask = undefined;
      }
    }

    // Determine active vs idle based on last activity
    const now = Date.now();
    for (const agent of agentMap.values()) {
      agent.status = now - agent.lastActiveTime < ACTIVE_THRESHOLD_MS ? "active" : "idle";
    }

    // Sort by status (active first), then by last active time
    return Array.from(agentMap.values()).sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "active" ? -1 : 1;
      }
      return b.lastActiveTime - a.lastActiveTime;
    });
  }, [events]);

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
      {/* Header with connection state */}
      <div
        style={{
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--surface0, #313244)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
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
          Agents
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              height: "0.5rem",
              width: "0.5rem",
              borderRadius: "50%",
              backgroundColor:
                state === "connected"
                  ? "var(--green, #a6e3a1)"
                  : state === "connecting" || state === "reconnecting"
                    ? "var(--yellow, #f9e2af)"
                    : "var(--red, #f38ba8)",
              animation:
                state === "connecting" || state === "reconnecting"
                  ? "pulse 2s infinite"
                  : "none",
            }}
            title={state}
          />
          <span
            style={{
              fontSize: "0.75rem",
              // WCAG AA: --subtext0 gives 6.8:1 contrast
              color: "var(--subtext0, #a6adc8)",
              textTransform: "capitalize",
            }}
          >
            {state}
          </span>
        </div>
      </div>

      {/* Agent cards */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
        {agents.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--overlay1, #7f849c)",
              textAlign: "center",
              padding: "2rem",
            }}
          >
            <p style={{ margin: 0 }}>No agents</p>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem" }}>
              Agents appear when they register
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {agents.map((agent) => (
              <AgentCard
                key={agent.name}
                name={agent.name}
                status={agent.status}
                lastActiveTime={agent.lastActiveTime}
                currentTask={agent.currentTask}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
