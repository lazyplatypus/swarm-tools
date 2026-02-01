/**
 * Queue Tools Tests
 *
 * Tests for BullMQ queue management MCP tools.
 * Uses in-memory Redis mock for isolation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { queue_submit, queue_status, queue_list, queue_cancel, resetQueueCache } from "./queue-tools";

// Mock swarm-queue to avoid Redis dependency
vi.mock("swarm-queue", () => {
	const mockJobs = new Map();
	let jobIdCounter = 0;

	const createMockQueue = () => {
		return {
			addJob: vi.fn(async (type: string, payload: unknown, options?: any) => {
				const jobId = `job-${++jobIdCounter}`;
				const job = {
					id: jobId,
					data: { type, payload },
					timestamp: Date.now(),
					processedOn: undefined,
					finishedOn: undefined,
					attemptsMade: 0,
					progress: 0,
					returnvalue: undefined,
					failedReason: undefined,
					getState: vi.fn(async () => "waiting"),
				};
				mockJobs.set(jobId, job);
				return jobId;
			}),
			getJob: vi.fn(async (jobId: string) => {
				return mockJobs.get(jobId);
			}),
			removeJob: vi.fn(async (jobId: string) => {
				mockJobs.delete(jobId);
			}),
			getMetrics: vi.fn(async () => ({
				waiting: mockJobs.size,
				active: 0,
				completed: 0,
				failed: 0,
				delayed: 0,
			})),
			close: vi.fn(async () => {}),
			underlying: {
				getJobs: vi.fn(async (state: string, start: number, end: number) => {
					return Array.from(mockJobs.values()).slice(start, end + 1);
				}),
			},
		};
	};

	return {
		createSwarmQueue: vi.fn(createMockQueue),
	};
});

// Mock event-utils to avoid swarm-mail dependency
vi.mock("./utils/event-utils", () => ({
	safeEmitEvent: vi.fn(async () => {}),
}));

const mockContext = { sessionID: "test-session" };

describe("queue_submit", () => {
	beforeEach(() => {
		resetQueueCache();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should submit a job with type and payload", async () => {
		const result = await queue_submit.execute(
			{
				type: "test-job",
				payload: JSON.stringify({ foo: "bar" }),
			},
			mockContext,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(true);
		expect(parsed.job_id).toMatch(/^job-\d+$/);
		expect(parsed.type).toBe("test-job");
		expect(parsed.queue).toBe("swarm");
	});

	it("should submit a job with priority and delay", async () => {
		const result = await queue_submit.execute(
			{
				type: "test-job",
				payload: JSON.stringify({ foo: "bar" }),
				priority: 10,
				delay: 5000,
			},
			mockContext,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(true);
	});

	it("should reject invalid JSON payload", async () => {
		const result = await queue_submit.execute(
			{
				type: "test-job",
				payload: "not-json",
			},
			mockContext,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain("Invalid JSON payload");
	});
});

describe("queue_status", () => {
	beforeEach(() => {
		resetQueueCache();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should return job status for existing job", async () => {
		// Submit a job first
		const submitResult = await queue_submit.execute(
			{
				type: "test-job",
				payload: JSON.stringify({ foo: "bar" }),
			},
			mockContext,
		);
		const submitParsed = JSON.parse(submitResult);
		const jobId = submitParsed.job_id;

		// Query status
		const statusResult = await queue_status.execute(
			{ job_id: jobId },
			mockContext,
		);

		const parsed = JSON.parse(statusResult);
		expect(parsed.success).toBe(true);
		expect(parsed.job_id).toBe(jobId);
		expect(parsed.type).toBe("test-job");
		expect(parsed.state).toBe("waiting");
		expect(parsed.data).toEqual({ foo: "bar" });
	});

	it("should return error for non-existent job", async () => {
		const result = await queue_status.execute(
			{ job_id: "non-existent" },
			mockContext,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain("Job not found");
	});
});

describe("queue_list", () => {
	beforeEach(() => {
		resetQueueCache();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should list queue metrics", async () => {
		// Submit a couple jobs
		await queue_submit.execute(
			{
				type: "test-job-1",
				payload: JSON.stringify({ foo: "bar" }),
			},
			mockContext,
		);
		await queue_submit.execute(
			{
				type: "test-job-2",
				payload: JSON.stringify({ baz: "qux" }),
			},
			mockContext,
		);

		const result = await queue_list.execute({}, mockContext);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(true);
		expect(parsed.metrics.waiting).toBe(2);
		expect(parsed.queue).toBe("swarm");
	});

	it("should list jobs by state", async () => {
		// Submit a job
		await queue_submit.execute(
			{
				type: "test-job",
				payload: JSON.stringify({ foo: "bar" }),
			},
			mockContext,
		);

		const result = await queue_list.execute(
			{ state: "waiting", limit: 10 },
			mockContext,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(true);
		expect(parsed.jobs.length).toBeGreaterThan(0);
		expect(parsed.jobs[0].type).toBe("test-job");
	});

	it("should reject invalid state", async () => {
		const result = await queue_list.execute(
			{ state: "invalid-state" },
			mockContext,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain("Invalid state");
	});
});

describe("queue_cancel", () => {
	beforeEach(() => {
		resetQueueCache();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should cancel existing job", async () => {
		// Submit a job first
		const submitResult = await queue_submit.execute(
			{
				type: "test-job",
				payload: JSON.stringify({ foo: "bar" }),
			},
			mockContext,
		);
		const submitParsed = JSON.parse(submitResult);
		const jobId = submitParsed.job_id;

		// Cancel it
		const cancelResult = await queue_cancel.execute(
			{ job_id: jobId },
			mockContext,
		);

		const parsed = JSON.parse(cancelResult);
		expect(parsed.success).toBe(true);
		expect(parsed.job_id).toBe(jobId);
		expect(parsed.message).toContain("cancelled");

		// Verify it's gone
		const statusResult = await queue_status.execute(
			{ job_id: jobId },
			mockContext,
		);
		const statusParsed = JSON.parse(statusResult);
		expect(statusParsed.success).toBe(false);
	});

	it("should return error for non-existent job", async () => {
		const result = await queue_cancel.execute(
			{ job_id: "non-existent" },
			mockContext,
		);

		const parsed = JSON.parse(result);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toContain("Job not found");
	});
});
