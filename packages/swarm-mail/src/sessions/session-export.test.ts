/**
 * Session Export Tests
 *
 * Tests the JSONL export function using in-memory libSQL database.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInMemorySwarmMailLibSQL } from "../libsql.convenience.js";
import type { SwarmMailAdapter } from "../types/adapter.js";
import { exportSessionsToJsonl } from "./session-export.js";

describe("exportSessionsToJsonl", () => {
	const testDir = join(tmpdir(), `session-export-test-${Date.now()}`);
	const outputDir = join(testDir, "sessions");
	const projectKey = "/test/project";

	let adapter: SwarmMailAdapter;

	beforeAll(async () => {
		// Create test directory
		await mkdir(testDir, { recursive: true });

		// Create in-memory SwarmMail adapter
		adapter = await createInMemorySwarmMailLibSQL("test-export");
	});

	afterAll(async () => {
		// Clean up
		await rm(testDir, { recursive: true, force: true });
		await adapter.close();
	});

	test("exports events to JSONL files grouped by session", async () => {
		// Register agents and create events with different session IDs
		await adapter.registerAgent(projectKey, "agent1", {
			program: "opencode",
			model: "claude",
		});

		await adapter.registerAgent(projectKey, "agent2", {
			program: "opencode",
			model: "claude",
		});

		// Send messages with thread_ids (acts as session_id)
		await adapter.sendMessage(
			projectKey,
			"agent1",
			["agent2"],
			"Message 1",
			"Body 1",
			{ threadId: "session-alpha" },
		);

		await adapter.sendMessage(
			projectKey,
			"agent2",
			["agent1"],
			"Message 2",
			"Body 2",
			{ threadId: "session-alpha" },
		);

		await adapter.sendMessage(
			projectKey,
			"agent1",
			["agent2"],
			"Message 3",
			"Body 3",
			{ threadId: "session-beta" },
		);

		// Export to JSONL
		const result = await exportSessionsToJsonl(adapter, outputDir);

		// Should export all events
		expect(result.exported).toBeGreaterThan(0);

		// Should create files (at least one for messages, possibly more for agent registrations)
		expect(result.files.length).toBeGreaterThan(0);

		// Verify files exist and contain valid JSON
		for (const filePath of result.files) {
			const content = await readFile(filePath, "utf-8");
			const lines = content.trim().split("\n");

			// Each line should be valid JSON
			for (const line of lines) {
				expect(() => JSON.parse(line)).not.toThrow();
			}
		}
	});

	test("filters events by since timestamp", async () => {
		const now = Date.now();

		// Create events before cutoff
		await adapter.sendMessage(
			projectKey,
			"agent1",
			["agent2"],
			"Old message",
			"Body",
			{ threadId: "old-session" },
		);

		// Wait a bit to ensure timestamp difference
		await new Promise((resolve) => setTimeout(resolve, 10));

		const cutoff = Date.now();

		// Create events after cutoff
		await adapter.sendMessage(
			projectKey,
			"agent1",
			["agent2"],
			"New message",
			"Body",
			{ threadId: "new-session" },
		);

		// Export only events after cutoff
		const result = await exportSessionsToJsonl(adapter, outputDir, {
			since: cutoff,
		});

		// Should only export recent events
		expect(result.exported).toBeGreaterThan(0);

		// Read exported files and verify timestamps
		for (const filePath of result.files) {
			const content = await readFile(filePath, "utf-8");
			const lines = content.trim().split("\n");

			for (const line of lines) {
				const event = JSON.parse(line);
				expect(event.timestamp).toBeGreaterThanOrEqual(cutoff);
			}
		}
	});

	test("filters events by sessionIds", async () => {
		// Create events in different sessions
		await adapter.sendMessage(
			projectKey,
			"agent1",
			["agent2"],
			"Session A msg",
			"Body",
			{ threadId: "filter-session-a" },
		);

		await adapter.sendMessage(
			projectKey,
			"agent1",
			["agent2"],
			"Session B msg",
			"Body",
			{ threadId: "filter-session-b" },
		);

		// Export only session A
		const result = await exportSessionsToJsonl(adapter, outputDir, {
			sessionIds: ["filter-session-a"],
		});

		// Should export at least one event
		expect(result.exported).toBeGreaterThan(0);

		// Verify only session A events are exported
		for (const filePath of result.files) {
			const content = await readFile(filePath, "utf-8");
			const lines = content.trim().split("\n");

			for (const line of lines) {
				const event = JSON.parse(line);
				// Event should have thread_id matching session A
				if (event.thread_id) {
					expect(event.thread_id).toBe("filter-session-a");
				}
			}
		}
	});

	test("handles empty event stream", async () => {
		// Create a new adapter with no events
		const emptyAdapter = await createInMemorySwarmMailLibSQL("test-empty");
		const emptyOutputDir = join(testDir, "empty");

		const result = await exportSessionsToJsonl(emptyAdapter, emptyOutputDir);

		expect(result.exported).toBe(0);
		expect(result.files.length).toBe(0);

		await emptyAdapter.close();
	});

	test("creates output directory if it doesn't exist", async () => {
		const nonExistentDir = join(testDir, "nonexistent", "nested", "dir");

		// Should not throw
		await expect(
			exportSessionsToJsonl(adapter, nonExistentDir),
		).resolves.toBeDefined();
	});

	test("exports events with correct JSONL format", async () => {
		// Create some events
		await adapter.sendMessage(
			projectKey,
			"agent1",
			["agent2"],
			"Format test",
			"Body",
			{ threadId: "format-session" },
		);

		const result = await exportSessionsToJsonl(adapter, outputDir);

		// Read a file
		const filePath = result.files[0];
		const content = await readFile(filePath, "utf-8");

		// Should end with newline
		expect(content.endsWith("\n")).toBe(true);

		// Each line should be valid JSON
		const lines = content.trim().split("\n");
		for (const line of lines) {
			const event = JSON.parse(line);

			// Should have base event fields
			expect(event).toHaveProperty("id");
			expect(event).toHaveProperty("type");
			expect(event).toHaveProperty("project_key");
			expect(event).toHaveProperty("timestamp");
			expect(event).toHaveProperty("sequence");
		}
	});
});
