/**
 * Tests for AgentsPane component
 * 
 * Tests the refactored AgentsPane that receives events as props
 * instead of creating its own useSwarmEvents hook.
 */

import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { AgentsPane } from "./AgentsPane";
import type { AgentEvent } from "../lib/types";

describe("AgentsPane", () => {
  test("renders empty state when no agents", () => {
    const events: AgentEvent[] = [];
    
    render(<AgentsPane events={events} state="connected" />);

    expect(screen.getByText(/no active agents/i)).toBeDefined();
  });

  test("renders agent cards for registered agents", () => {
    const now = Date.now();
    const events: AgentEvent[] = [
      {
        id: 1,
        type: "agent_registered",
        agent_name: "BlueLake",
        timestamp: now,
        sequence: 1,
        project_key: "/test",
        program: "opencode",
        model: "unknown",
        task_description: "Test task 1",
      },
      {
        id: 2,
        type: "agent_registered",
        agent_name: "RedMountain",
        timestamp: now,
        sequence: 2,
        project_key: "/test",
        program: "opencode",
        model: "unknown",
        task_description: "Test task 2",
      },
    ];

    render(<AgentsPane events={events} state="connected" />);

    expect(screen.getByText("BlueLake")).toBeDefined();
    expect(screen.getByText("RedMountain")).toBeDefined();
  });

  test("shows connection state indicator", () => {
    const events: AgentEvent[] = [];
    
    render(<AgentsPane events={events} state="connecting" />);

    expect(screen.getByText(/connecting/i)).toBeDefined();
  });

  test("derives agent state from multiple event types", () => {
    const baseTime = Date.now();
    const events: AgentEvent[] = [
      {
        id: 1,
        type: "agent_registered",
        agent_name: "Worker1",
        timestamp: baseTime,
        sequence: 1,
        project_key: "/test",
        program: "opencode",
        model: "unknown",
        task_description: "Initial task",
      },
      {
        id: 2,
        type: "task_started",
        agent_name: "Worker1",
        timestamp: baseTime + 1000,
        sequence: 2,
        project_key: "/test",
        bead_id: "task-123",
        message: "Starting work",
        files_affected: [],
      },
      {
        id: 3,
        type: "task_progress",
        agent_name: "Worker1",
        timestamp: baseTime + 2000,
        sequence: 3,
        project_key: "/test",
        bead_id: "task-123",
        message: "50% complete",
        progress_percent: 50,
      },
    ];

    render(<AgentsPane events={events} state="connected" />);

    // Agent should appear with latest task message
    expect(screen.getByText("Worker1")).toBeDefined();
    expect(screen.getByText("50% complete")).toBeDefined();
  });
});
