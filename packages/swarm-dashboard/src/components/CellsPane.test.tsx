/**
 * CellsPane component tests
 * 
 * Tests real-time cell fetching and display
 * Uses global fetch mock from test-setup.ts
 */

import { describe, test, expect } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { CellsPane } from "./CellsPane";

describe("CellsPane", () => {
  test("displays loading state initially", () => {
    render(<CellsPane />);
    expect(screen.getByText("Loading...")).toBeDefined();
  });

  test("displays cells after loading", async () => {
    render(<CellsPane />);
    
    await waitFor(() => {
      expect(screen.getByText("Test Epic")).toBeDefined();
      expect(screen.getByText("Test Task")).toBeDefined();
    });
  });

  test("displays cell count in header", async () => {
    render(<CellsPane />);
    
    await waitFor(() => {
      // Should show "2 cells · 1 open" (epic + task, task is open)
      const header = screen.getByText(/2 cells/);
      expect(header).toBeDefined();
      expect(screen.getByText(/1 open/)).toBeDefined();
    }, { timeout: 3000 });
  });

  test("displays empty state when no cells", async () => {
    // Override global fetch mock for this test
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ cells: [] }),
    } as Response);
    
    render(<CellsPane />);
    
    await waitFor(() => {
      expect(screen.getByText("No cells found")).toBeDefined();
    }, { timeout: 3000 });
  });

  test("handles API errors gracefully", async () => {
    // Override global fetch mock to throw error
    globalThis.fetch = async () => {
      throw new Error("Network error");
    };
    
    render(<CellsPane />);
    
    await waitFor(() => {
      // getCells catches errors and returns [], so component shows "No cells found"
      expect(screen.getByText("No cells found")).toBeDefined();
    }, { timeout: 3000 });
  });
});
