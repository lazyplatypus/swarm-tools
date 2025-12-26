/**
 * API client tests
 * 
 * Tests for tree-building and sorting logic. Network behavior is tested via component tests.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { getCells } from "./api";

describe("getCells tree building logic", () => {
  let fetchSpy: any;

  beforeEach(() => {
    // Mock fetch for each test
    fetchSpy = spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test("builds parent-child tree structure", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        cells: [
          {
            id: "epic-1",
            title: "Test Epic",
            status: "in_progress",
            priority: 0,
            issue_type: "epic",
          },
          {
            id: "task-1",
            title: "Test Task",
            status: "open",
            priority: 1,
            issue_type: "task",
            parent_id: "epic-1",
          },
        ],
      }),
    });

    const cells = await getCells("http://localhost:3001");

    // Should have 1 root cell (epic)
    expect(cells.length).toBe(1);
    const epic = cells[0];
    expect(epic.issue_type).toBe("epic");

    // Epic should have task as child
    expect(epic.children).toBeDefined();
    expect(epic.children?.length).toBe(1);
    expect(epic.children?.[0].id).toBe("task-1");
    expect(epic.children?.[0].parent_id).toBe("epic-1");
  });

  test("sorts epics first, then by priority", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        cells: [
          {
            id: "task-1",
            title: "Task P0",
            status: "open",
            priority: 0,
            issue_type: "task",
          },
          {
            id: "epic-1",
            title: "Epic P2",
            status: "in_progress",
            priority: 2,
            issue_type: "epic",
          },
          {
            id: "bug-1",
            title: "Bug P1",
            status: "open",
            priority: 1,
            issue_type: "bug",
          },
        ],
      }),
    });

    const cells = await getCells("http://localhost:3001");

    // Epic should be first despite higher priority number
    expect(cells[0].issue_type).toBe("epic");
    // Then task (P0 < P1)
    expect(cells[1].issue_type).toBe("task");
    expect(cells[1].priority).toBe(0);
    // Then bug (P1)
    expect(cells[2].issue_type).toBe("bug");
    expect(cells[2].priority).toBe(1);
  });

  test("returns empty array on network error", async () => {
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));

    const cells = await getCells("http://localhost:3001");
    expect(Array.isArray(cells)).toBe(true);
    expect(cells.length).toBe(0);
  });

  test("returns empty array on 404", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const cells = await getCells("http://localhost:3001");
    expect(Array.isArray(cells)).toBe(true);
    expect(cells.length).toBe(0);
  });
});
