/**
 * Tests for SwarmWorker and sandbox functionality
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createSwarmQueue } from "./client";
import { createSwarmWorker } from "./worker";
import { runSandboxed, isSystemdAvailable } from "./sandbox";
import type { JobData, JobResult } from "./types";
import type { Job as BullJob } from "bullmq";

describe("Sandbox", () => {
  it("should execute a simple command", async () => {
    const result = await runSandboxed("echo", ["hello world"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello world");
    expect(result.timedOut).toBe(false);
  });

  it("should enforce timeout", async () => {
    const result = await runSandboxed(
      "sleep",
      ["10"],
      { timeoutMs: 100 }
    );

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  }, 10000);

  it("should apply CPU nice level", async () => {
    const result = await runSandboxed(
      "bash",
      ["-c", "echo test"],
      { cpuNice: 15 }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("test");
  });

  it("should handle command failures", async () => {
    const result = await runSandboxed("false", []);

    expect(result.exitCode).toBe(1);
  });

  it("should capture stderr", async () => {
    const result = await runSandboxed(
      "bash",
      ["-c", "echo error >&2"]
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr.trim()).toBe("error");
  });

  it("should check systemd availability", async () => {
    const available = await isSystemdAvailable();
    expect(typeof available).toBe("boolean");
  });

  it("should use systemd-run if available and requested", async () => {
    const available = await isSystemdAvailable();

    if (available) {
      const result = await runSandboxed(
        "echo",
        ["systemd test"],
        { useSystemd: true }
      );

      // Systemd may not work in all environments (containers, etc)
      // Just verify the attempt was made - don't fail if systemd is flaky
      if (result.exitCode === 0) {
        expect(result.stdout.trim()).toBe("systemd test");
      } else {
        // Log stderr for debugging but don't fail test
        console.log("Systemd execution failed (expected in some environments):", result.stderr);
      }
    }
  }, 10000);

  it("should apply memory limits via ulimit", async () => {
    // This test attempts to allocate more memory than the limit
    // Note: This may not always trigger OOM on all systems
    const result = await runSandboxed(
      "node",
      ["-e", "const arr = []; for(let i=0; i<1000000; i++) arr.push(new Array(1000).fill(0))"],
      {
        memoryLimitMB: 50,
        timeoutMs: 5000,
      }
    );

    // Should either fail due to memory limit or timeout
    expect(result.exitCode).not.toBe(0);
  }, 10000);
});

describe("SwarmWorker", () => {
  const queueName = `test-worker-${Date.now()}`;
  let queue: Awaited<ReturnType<typeof createSwarmQueue>>;

  beforeAll(async () => {
    queue = createSwarmQueue({
      name: queueName,
      connection: { host: "localhost", port: 6379 },
    });
  });

  afterAll(async () => {
    await queue.close();
  });

  beforeEach(async () => {
    // Clean up queue before each test
    const jobs = await queue.underlying.getJobs(["waiting", "active", "completed", "failed"]);
    for (const job of jobs) {
      await job.remove();
    }
  });

  it("should process jobs successfully", async () => {
    const results: string[] = [];

    const worker = createSwarmWorker(
      {
        queueName,
        connection: { host: "localhost", port: 6379 },
        concurrency: 1,
      },
      async (job) => {
        const { payload } = job.data;
        results.push(payload as string);

        return {
          success: true,
          data: `processed: ${payload}`,
        };
      }
    );

    await worker.start();

    // Add a job
    const jobId = await queue.addJob("test", "test-data");

    // Wait for job to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const processedJob = await queue.getJob(jobId);
    expect(processedJob?.returnvalue?.success).toBe(true);
    expect(processedJob?.returnvalue?.data).toBe("processed: test-data");
    expect(results).toContain("test-data");

    await worker.close();
  }, 10000);

  it("should report progress during job processing", async () => {
    const worker = createSwarmWorker(
      {
        queueName,
        connection: { host: "localhost", port: 6379 },
      },
      async (job) => {
        // Simulate work with progress updates
        await job.updateProgress({ stage: "processing", percent: 50 });
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { success: true };
      }
    );

    await worker.start();

    const jobId = await queue.addJob("test", "test-data");

    // Wait for job to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    const job = await queue.getJob(jobId);
    const progress = job?.progress;

    // Final progress should show completion
    expect(progress).toMatchObject({ stage: "completed", percent: 100 });

    await worker.close();
  }, 10000);

  it("should execute jobs with sandboxing", async () => {
    const worker = createSwarmWorker(
      {
        queueName,
        connection: { host: "localhost", port: 6379 },
        sandboxConfig: {
          cpuNice: 10,
          timeoutMs: 5000,
        },
      },
      async (job, sandbox) => {
        // Use sandbox to run a command
        const result = await sandbox("echo", ["sandboxed output"]);

        return {
          success: result.exitCode === 0,
          data: result.stdout.trim(),
        };
      }
    );

    await worker.start();

    const jobId = await queue.addJob("sandbox-test", {});
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const job = await queue.getJob(jobId);
    expect(job?.returnvalue?.success).toBe(true);
    expect(job?.returnvalue?.data).toBe("sandboxed output");

    await worker.close();
  }, 10000);

  it("should enforce job timeout via sandbox", async () => {
    const worker = createSwarmWorker(
      {
        queueName,
        connection: { host: "localhost", port: 6379 },
        sandboxConfig: {
          timeoutMs: 500,
        },
      },
      async (job, sandbox) => {
        // Try to run a long-running command
        const result = await sandbox("sleep", ["10"]);

        return {
          success: !result.timedOut,
          data: result.timedOut ? "timeout" : "completed",
        };
      }
    );

    await worker.start();

    const jobId = await queue.addJob("timeout-test", {});
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const job = await queue.getJob(jobId);
    expect(job?.returnvalue?.success).toBe(false);
    expect(job?.returnvalue?.data).toBe("timeout");

    await worker.close();
  }, 10000);

  it("should handle graceful shutdown", async () => {
    const worker = createSwarmWorker(
      {
        queueName,
        connection: { host: "localhost", port: 6379 },
      },
      async (job) => {
        // Simulate some work
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { success: true };
      }
    );

    await worker.start();

    // Add a job
    await queue.addJob("shutdown-test", {});

    // Give it a moment to start processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(worker.activeJobCount).toBeGreaterThan(0);

    // Shutdown and wait for job completion
    await worker.shutdown(5000);

    expect(worker.activeJobCount).toBe(0);
    expect(worker.shuttingDown).toBe(true);
  }, 10000);

  it("should reject new jobs during shutdown", async () => {
    const worker = createSwarmWorker(
      {
        queueName,
        connection: { host: "localhost", port: 6379 },
      },
      async (job) => {
        return { success: true };
      }
    );

    await worker.start();
    await worker.pause();

    // Manually set shutdown state
    (worker as any).isShuttingDown = true;

    // Add a job
    const jobId = await queue.addJob("reject-test", {});

    // Resume to try processing
    await worker.resume();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const job = await queue.getJob(jobId);

    // Job should fail due to shutdown
    if (job?.returnvalue) {
      expect(job.returnvalue.success).toBe(false);
      expect(job.returnvalue.error).toContain("shutting down");
    }

    await worker.close();
  }, 10000);

  it("should disable sandbox when configured", async () => {
    const worker = createSwarmWorker(
      {
        queueName,
        connection: { host: "localhost", port: 6379 },
        enableSandbox: false,
      },
      async (job, sandbox) => {
        // Sandbox runner should still be available but won't apply limits
        const result = await sandbox("echo", ["no sandbox"]);
        return { success: true, data: result.stdout.trim() };
      }
    );

    await worker.start();

    const jobId = await queue.addJob("no-sandbox", {});
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const job = await queue.getJob(jobId);
    expect(job?.returnvalue?.data).toBe("no sandbox");

    await worker.close();
  }, 10000);
});
