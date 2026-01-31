/**
 * Tests for SwarmQueue client
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { SwarmQueue, createSwarmQueue } from "./client";
import type { QueueConfig } from "./types";

// Test configuration - uses local Redis
const testConfig: QueueConfig = {
  name: "test-queue-client",
  connection: {
    host: "localhost",
    port: 6379,
    db: 1, // Use db 1 for tests to avoid conflicts
  },
};

describe("SwarmQueue", () => {
  let queue: SwarmQueue;

  beforeEach(() => {
    queue = createSwarmQueue(testConfig);
  });

  afterEach(async () => {
    // Clean up queue
    await queue.close();
  });

  describe("Job submission", () => {
    test("adds job and returns job ID", async () => {
      const jobId = await queue.addJob("test-task", { data: "example" });

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe("string");
    });

    test("accepts custom job ID", async () => {
      const customId = "custom-job-123";
      const jobId = await queue.addJob("test-task", { data: "example" }, {
        jobId: customId,
      });

      expect(jobId).toBe(customId);
    });

    test("accepts job options (priority, delay)", async () => {
      const jobId = await queue.addJob(
        "test-task",
        { data: "example" },
        {
          priority: 1,
          delay: 1000,
          attempts: 3,
        }
      );

      const job = await queue.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.opts.priority).toBe(1);
      expect(job?.opts.delay).toBe(1000);
      expect(job?.opts.attempts).toBe(3);
    });

    test("supports retry with backoff", async () => {
      const jobId = await queue.addJob(
        "test-task",
        { data: "example" },
        {
          attempts: 5,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
        }
      );

      const job = await queue.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.opts.attempts).toBe(5);
      expect(job?.opts.backoff).toEqual({
        type: "exponential",
        delay: 1000,
      });
    });
  });

  describe("Job retrieval", () => {
    test("retrieves job by ID", async () => {
      const jobId = await queue.addJob("test-task", { message: "hello" });
      const job = await queue.getJob(jobId);

      expect(job).toBeDefined();
      expect(job?.id).toBe(jobId);
      expect(job?.data.type).toBe("test-task");
      expect(job?.data.payload).toEqual({ message: "hello" });
    });

    test("returns undefined for non-existent job", async () => {
      const job = await queue.getJob("non-existent-id");
      expect(job).toBeUndefined();
    });
  });

  describe("Job removal", () => {
    test("removes job by ID", async () => {
      const jobId = await queue.addJob("test-task", { data: "example" });

      // Verify job exists
      let job = await queue.getJob(jobId);
      expect(job).toBeDefined();

      // Remove job
      await queue.removeJob(jobId);

      // Verify job is gone
      job = await queue.getJob(jobId);
      expect(job).toBeUndefined();
    });

    test("does not throw when removing non-existent job", async () => {
      // Should not throw
      await queue.removeJob("non-existent-id");
    });
  });

  describe("Queue metrics", () => {
    test("returns metrics for all job states", async () => {
      // Add a few jobs
      await queue.addJob("task-1", { data: "a" });
      await queue.addJob("task-2", { data: "b" });
      await queue.addJob("task-3", { data: "c" }, { delay: 5000 });

      const metrics = await queue.getMetrics();

      expect(metrics).toBeDefined();
      expect(typeof metrics.waiting).toBe("number");
      expect(typeof metrics.active).toBe("number");
      expect(typeof metrics.completed).toBe("number");
      expect(typeof metrics.failed).toBe("number");
      expect(typeof metrics.delayed).toBe("number");

      // We should have at least 2 waiting and 1 delayed
      expect(metrics.waiting).toBeGreaterThanOrEqual(2);
      expect(metrics.delayed).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Graceful shutdown", () => {
    test("closes queue and connection", async () => {
      await queue.addJob("test-task", { data: "example" });
      await queue.close();

      // Attempting operations after close should throw
      await expect(queue.addJob("test-task", { data: "fail" })).rejects.toThrow(
        "Queue is closed"
      );
    });

    test("close is idempotent", async () => {
      await queue.close();
      await queue.close(); // Should not throw
    });
  });

  describe("Factory function", () => {
    test("createSwarmQueue returns SwarmQueue instance", () => {
      const q = createSwarmQueue(testConfig);
      expect(q).toBeInstanceOf(SwarmQueue);
      q.close(); // Clean up
    });
  });

  describe("Underlying queue access", () => {
    test("exposes underlying BullMQ queue", () => {
      const underlying = queue.underlying;
      expect(underlying).toBeDefined();
      expect(underlying.name).toBe(testConfig.name);
    });
  });
});
