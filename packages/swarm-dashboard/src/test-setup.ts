/**
 * Test setup for Bun + Testing Library
 * 
 * Provides DOM environment using happy-dom + global fetch mocks
 */

import { Window } from "happy-dom";
import { beforeEach, afterEach, spyOn } from "bun:test";

// Create and register happy-dom window
const window = new Window({ url: "http://localhost:3000" });
const document = window.document;

// Set globals for testing-library
globalThis.window = window as any;
globalThis.document = document as any;
globalThis.navigator = window.navigator as any;
globalThis.HTMLElement = window.HTMLElement as any;

// Default cell fixtures for tests
export const mockCellFixtures = [
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
];

let fetchSpy: any;

beforeEach(() => {
  // Mock fetch globally with default fixtures
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(async (url: string | Request) => {
    const urlString = typeof url === "string" ? url : url.url;
    
    // Return mock cell data for /cells endpoint
    if (urlString.includes("/cells")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ cells: mockCellFixtures }),
      } as Response;
    }
    
    // Default: network error
    throw new TypeError("fetch failed - unmocked URL: " + urlString);
  });
});

afterEach(() => {
  if (fetchSpy) {
    fetchSpy.mockRestore();
  }
});
