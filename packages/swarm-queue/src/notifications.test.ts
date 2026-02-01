/**
 * Tests for Queue Notifications
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { Job as BullJob } from "bullmq";
import { QueueNotifier, createQueueNotifier } from "./notifications";
import type { JobData } from "./types";
import type { QueueEvent } from "./events";

// Mock BullJob
function createMockJob<T>(overrides?: Partial<BullJob<JobData<T>>>): BullJob<JobData<T>> {
  return {
    id: "job-123",
    data: {
      type: "test-task",
      payload: {} as T,
      metadata: { foo: "bar" },
    },
    opts: {
      priority: 1,
      delay: 0,
      attempts: 3,
    },
    attemptsMade: 0,
    ...overrides,
  } as BullJob<JobData<T>>;
}

describe("QueueNotifier", () => {
  let notifier: QueueNotifier;
  let eventsSeen: QueueEvent[] = [];

  beforeEach(() => {
    eventsSeen = [];
    notifier = createQueueNotifier({
      queueName: "test-queue",
      projectKey: "/test/project",
    });

    // Add event collector
    notifier.on((event) => {
      eventsSeen.push(event);
    });
  });

  describe("onJobSubmitted", () => {
    it("should emit job_submitted event", async () => {
      const job = createMockJob();
      await notifier.onJobSubmitted(job);

      expect(eventsSeen).toHaveLength(1);
      expect(eventsSeen[0]).toMatchObject({
        type: "job_submitted",
        jobId: "job-123",
        queueName: "test-queue",
        jobType: "test-task",
        priority: 1,
        delay: 0,
        metadata: { foo: "bar" },
      });
      expect(eventsSeen[0].timestamp).toBeGreaterThan(0);
    });
  });

  describe("onJobStarted", () => {
    it("should emit job_started event without worker name", async () => {
      const job = createMockJob();
      await notifier.onJobStarted(job);

      expect(eventsSeen).toHaveLength(1);
      expect(eventsSeen[0]).toMatchObject({
        type: "job_started",
        jobId: "job-123",
        queueName: "test-queue",
        jobType: "test-task",
        attemptNumber: 1,
      });
      expect(eventsSeen[0].timestamp).toBeGreaterThan(0);
    });

    it("should emit job_started event with worker name", async () => {
      const job = createMockJob();
      await notifier.onJobStarted(job, "worker-1");

      expect(eventsSeen).toHaveLength(1);
      expect(eventsSeen[0]).toMatchObject({
        type: "job_started",
        jobId: "job-123",
        workerName: "worker-1",
      });
    });

    it("should track attempt number correctly", async () => {
      const job = createMockJob({ attemptsMade: 2 });
      await notifier.onJobStarted(job);

      expect(eventsSeen[0]).toMatchObject({
        attemptNumber: 3,
      });
    });
  });

  describe("onJobCompleted", () => {
    it("should emit job_completed event", async () => {
      const job = createMockJob();
      const result = { success: true, data: { output: "done" } };
      const startTime = Date.now() - 1000; // 1s ago

      await notifier.onJobCompleted(job, result, startTime);

      expect(eventsSeen).toHaveLength(1);
      expect(eventsSeen[0]).toMatchObject({
        type: "job_completed",
        jobId: "job-123",
        queueName: "test-queue",
        jobType: "test-task",
        result,
        attemptNumber: 1,
      });
      expect((eventsSeen[0] as any).durationMs).toBeGreaterThanOrEqual(1000);
    });
  });

  describe("onJobFailed", () => {
    it("should emit job_failed event with Error", async () => {
      const job = createMockJob();
      const error = new Error("Something broke");

      await notifier.onJobFailed(job, error);

      expect(eventsSeen).toHaveLength(1);
      expect(eventsSeen[0]).toMatchObject({
        type: "job_failed",
        jobId: "job-123",
        queueName: "test-queue",
        jobType: "test-task",
        error: "Something broke",
        attemptNumber: 1,
        willRetry: true,
        maxAttempts: 3,
      });
    });

    it("should emit job_failed event with string error", async () => {
      const job = createMockJob();
      await notifier.onJobFailed(job, "String error");

      expect(eventsSeen[0]).toMatchObject({
        error: "String error",
      });
    });

    it("should indicate no retry when max attempts reached", async () => {
      const job = createMockJob({ attemptsMade: 2, opts: { attempts: 3 } });
      await notifier.onJobFailed(job, new Error("Failed"));

      expect(eventsSeen[0]).toMatchObject({
        attemptNumber: 3,
        willRetry: false,
        maxAttempts: 3,
      });
    });
  });

  describe("onJobProgress", () => {
    it("should emit job_progress event with simple progress", async () => {
      const job = createMockJob();
      await notifier.onJobProgress(job, { count: 50 });

      expect(eventsSeen).toHaveLength(1);
      expect(eventsSeen[0]).toMatchObject({
        type: "job_progress",
        jobId: "job-123",
        queueName: "test-queue",
        jobType: "test-task",
        progress: { count: 50 },
      });
    });

    it("should extract stage and percent from progress object", async () => {
      const job = createMockJob();
      await notifier.onJobProgress(job, {
        stage: "processing",
        percent: 75,
        custom: "data",
      });

      expect(eventsSeen[0]).toMatchObject({
        type: "job_progress",
        stage: "processing",
        percent: 75,
        progress: {
          stage: "processing",
          percent: 75,
          custom: "data",
        },
      });
    });
  });

  describe("onJobStalled", () => {
    it("should emit job_stalled event", async () => {
      const job = createMockJob({ attemptsMade: 2 });
      await notifier.onJobStalled(job);

      expect(eventsSeen).toHaveLength(1);
      expect(eventsSeen[0]).toMatchObject({
        type: "job_stalled",
        jobId: "job-123",
        queueName: "test-queue",
        jobType: "test-task",
        stalledCount: 2,
      });
    });
  });

  describe("event filtering by targets", () => {
    beforeEach(() => {
      eventsSeen = [];
      notifier = createQueueNotifier({
        queueName: "test-queue",
        projectKey: "/test/project",
        targets: [
          {
            agents: ["coordinator"],
            eventTypes: ["job_failed", "job_stalled"],
          },
        ],
      });

      notifier.on((event) => {
        eventsSeen.push(event);
      });
    });

    it("should emit events matching target filter", async () => {
      const job = createMockJob();
      await notifier.onJobFailed(job, new Error("Failed"));

      expect(eventsSeen).toHaveLength(1);
      expect(eventsSeen[0].type).toBe("job_failed");
    });

    it("should not emit events not matching target filter", async () => {
      const job = createMockJob();
      await notifier.onJobStarted(job);
      await notifier.onJobCompleted(job, {}, Date.now());

      expect(eventsSeen).toHaveLength(0);
    });

    it("should emit all events when target has no eventTypes filter", async () => {
      notifier = createQueueNotifier({
        queueName: "test-queue",
        projectKey: "/test/project",
        targets: [{ agents: ["worker"] }], // No eventTypes = all events
      });

      eventsSeen = [];
      notifier.on((event) => {
        eventsSeen.push(event);
      });

      const job = createMockJob();
      await notifier.onJobSubmitted(job);
      await notifier.onJobStarted(job);
      await notifier.onJobCompleted(job, {}, Date.now());

      expect(eventsSeen).toHaveLength(3);
    });
  });

  describe("multiple handlers", () => {
    it("should call all registered handlers", async () => {
      const handler1 = mock();
      const handler2 = mock();

      notifier.on(handler1);
      notifier.on(handler2);

      const job = createMockJob();
      await notifier.onJobSubmitted(job);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler1).toHaveBeenCalledWith(
        expect.objectContaining({ type: "job_submitted" })
      );
    });

    it("should remove handler when calling off()", async () => {
      const handler = mock();

      notifier.on(handler);
      notifier.off(handler);

      const job = createMockJob();
      await notifier.onJobSubmitted(job);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should continue if a handler throws", async () => {
      const errorHandler = mock(() => {
        throw new Error("Handler error");
      });
      const successHandler = mock();

      // Spy on console.error to suppress output
      const originalError = console.error;
      console.error = mock();

      notifier.on(errorHandler);
      notifier.on(successHandler);

      const job = createMockJob();
      await notifier.onJobSubmitted(job);

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(successHandler).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(
        "[QueueNotifier] Handler error:",
        expect.any(Error)
      );

      console.error = originalError;
    });
  });

  describe("custom handler in config", () => {
    it("should call custom handler from config", async () => {
      const customHandler = mock();
      notifier = createQueueNotifier({
        queueName: "test-queue",
        projectKey: "/test/project",
        customHandler,
      });

      const job = createMockJob();
      await notifier.onJobSubmitted(job);

      expect(customHandler).toHaveBeenCalledTimes(1);
      expect(customHandler).toHaveBeenCalledWith(
        expect.objectContaining({ type: "job_submitted" })
      );
    });
  });

  describe("target management", () => {
    it("should get current targets", () => {
      const targets = [{ agents: ["agent-1"], eventTypes: ["job_failed" as const] }];
      notifier = createQueueNotifier({
        queueName: "test-queue",
        projectKey: "/test/project",
        targets,
      });

      expect(notifier.getTargets()).toEqual(targets);
    });

    it("should add new target", () => {
      notifier.addTarget({ agents: ["agent-2"], eventTypes: ["job_started"] });
      expect(notifier.getTargets()).toContainEqual({
        agents: ["agent-2"],
        eventTypes: ["job_started"],
      });
    });

    it("should remove target by agent name", () => {
      notifier = createQueueNotifier({
        queueName: "test-queue",
        projectKey: "/test/project",
        targets: [
          { agents: ["agent-1"], eventTypes: ["job_failed"] },
          { agents: ["agent-2"], eventTypes: ["job_started"] },
        ],
      });

      notifier.removeTarget("agent-1");
      expect(notifier.getTargets()).toHaveLength(1);
      expect(notifier.getTargets()[0].agents).toEqual(["agent-2"]);
    });
  });

  describe("async handlers", () => {
    it("should await async handlers", async () => {
      let handlerResolved = false;

      notifier.on(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        handlerResolved = true;
      });

      const job = createMockJob();
      await notifier.onJobSubmitted(job);

      expect(handlerResolved).toBe(true);
    });
  });
});
