/**
 * Queue Command - Manage SwarmQueue jobs
 *
 * Commands:
 *   swarm queue submit <type> --payload '{}' --priority 2 --delay 0
 *   swarm queue status <jobId>
 *   swarm queue list [--state waiting|active|completed|failed|delayed]
 *   swarm queue worker [--concurrency 5] [--sandbox]
 *
 * Built on swarm-queue package (BullMQ + Redis)
 */

import * as p from "@clack/prompts";
import { createSwarmQueue, createSwarmWorker } from "swarm-queue";
import type { Job as BullJob } from "bullmq";

// Color utilities
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

// Default Redis connection
const DEFAULT_CONNECTION = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
};

// Default queue name
const DEFAULT_QUEUE_NAME = process.env.SWARM_QUEUE_NAME || "swarm-tasks";

/**
 * Main queue command handler
 */
export async function queue() {
  const args = process.argv.slice(3);

  if (args.length === 0 || args.includes("--help") || args.includes("help")) {
    showHelp();
    return;
  }

  const subcommand = args[0];

  try {
    switch (subcommand) {
      case "submit":
        await submitJob(args.slice(1));
        break;
      case "status":
        await showJobStatus(args.slice(1));
        break;
      case "list":
        await listJobs(args.slice(1));
        break;
      case "worker":
        await runWorker(args.slice(1));
        break;
      default:
        console.error(red(`Unknown queue subcommand: ${subcommand}`));
        console.log(dim("\nRun 'swarm queue --help' for usage"));
        process.exit(1);
    }
  } catch (error: any) {
    console.error(red(`Error: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Submit a job to the queue
 *
 * swarm queue submit <type> --payload '{"data":"value"}' --priority 2 --delay 1000
 */
async function submitJob(args: string[]) {
  if (args.length === 0) {
    console.error(red("Error: Job type is required"));
    console.log(dim("Usage: swarm queue submit <type> [options]"));
    process.exit(1);
  }

  const jobType = args[0];
  let payload: any = {};
  let priority = 5;
  let delay = 0;
  let queueName = DEFAULT_QUEUE_NAME;

  // Parse options
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--payload" && i + 1 < args.length) {
      try {
        payload = JSON.parse(args[++i]);
      } catch (e) {
        console.error(red("Error: Invalid JSON payload"));
        process.exit(1);
      }
    } else if (arg === "--priority" && i + 1 < args.length) {
      priority = parseInt(args[++i], 10);
    } else if (arg === "--delay" && i + 1 < args.length) {
      delay = parseInt(args[++i], 10);
    } else if (arg === "--queue" && i + 1 < args.length) {
      queueName = args[++i];
    }
  }

  const queueClient = createSwarmQueue({
    name: queueName,
    connection: DEFAULT_CONNECTION,
  });

  try {
    const jobId = await queueClient.addJob(jobType, payload, {
      priority,
      delay,
    });

    console.log(green(`Job submitted successfully`));
    console.log(dim(`Queue: ${queueName}`));
    console.log(dim(`Job ID: ${jobId}`));
    console.log(dim(`Type: ${jobType}`));
    console.log(dim(`Priority: ${priority}`));
    if (delay > 0) {
      console.log(dim(`Delay: ${delay}ms`));
    }
  } finally {
    await queueClient.close();
  }
}

/**
 * Show job status
 *
 * swarm queue status <jobId>
 */
async function showJobStatus(args: string[]) {
  if (args.length === 0) {
    console.error(red("Error: Job ID is required"));
    console.log(dim("Usage: swarm queue status <jobId>"));
    process.exit(1);
  }

  const jobId = args[0];
  const queueName = args.find((a, i) => args[i - 1] === "--queue") || DEFAULT_QUEUE_NAME;

  const queueClient = createSwarmQueue({
    name: queueName,
    connection: DEFAULT_CONNECTION,
  });

  try {
    const job = await queueClient.getJob(jobId);

    if (!job) {
      console.error(red(`Job not found: ${jobId}`));
      process.exit(1);
    }

    // Display job details
    console.log(bold(cyan("Job Status")));
    console.log(dim("─".repeat(50)));
    console.log(`${bold("Job ID:")} ${job.id}`);
    console.log(`${bold("Type:")} ${job.name}`);
    console.log(`${bold("State:")} ${await getJobState(job)}`);

    if (job.data) {
      console.log(`${bold("Payload:")}`);
      console.log(dim(JSON.stringify(job.data, null, 2)));
    }

    if (job.progress) {
      console.log(`${bold("Progress:")} ${JSON.stringify(job.progress)}`);
    }

    if (job.returnvalue) {
      console.log(`${bold("Result:")}`);
      console.log(dim(JSON.stringify(job.returnvalue, null, 2)));
    }

    if (job.failedReason) {
      console.log(red(`${bold("Error:")} ${job.failedReason}`));
    }

    console.log(dim("─".repeat(50)));
    console.log(dim(`Created: ${new Date(job.timestamp).toISOString()}`));
    if (job.processedOn) {
      console.log(dim(`Processed: ${new Date(job.processedOn).toISOString()}`));
    }
    if (job.finishedOn) {
      console.log(dim(`Finished: ${new Date(job.finishedOn).toISOString()}`));
    }
  } finally {
    await queueClient.close();
  }
}

/**
 * Get job state as a colored string
 */
async function getJobState(job: BullJob): Promise<string> {
  const state = await job.getState();
  switch (state) {
    case "completed":
      return green(state);
    case "failed":
      return red(state);
    case "active":
      return yellow(state);
    case "waiting":
    case "delayed":
      return cyan(state);
    default:
      return state;
  }
}

/**
 * List jobs by state
 *
 * swarm queue list [--state waiting|active|completed|failed|delayed]
 */
async function listJobs(args: string[]) {
  const queueName = args.find((a, i) => args[i - 1] === "--queue") || DEFAULT_QUEUE_NAME;
  const stateFilter = args.find((a, i) => args[i - 1] === "--state");
  const limit = parseInt(args.find((a, i) => args[i - 1] === "--limit") || "10", 10);

  const queueClient = createSwarmQueue({
    name: queueName,
    connection: DEFAULT_CONNECTION,
  });

  try {
    const metrics = await queueClient.getMetrics();

    // Show summary
    console.log(bold(cyan("Queue Summary")));
    console.log(dim("─".repeat(50)));
    console.log(`${bold("Queue:")} ${queueName}`);
    console.log(`${cyan("Waiting:")} ${metrics.waiting}`);
    console.log(`${yellow("Active:")} ${metrics.active}`);
    console.log(`${cyan("Delayed:")} ${metrics.delayed}`);
    console.log(`${green("Completed:")} ${metrics.completed}`);
    console.log(`${red("Failed:")} ${metrics.failed}`);
    console.log(dim("─".repeat(50)));

    // Show detailed list if state filter provided
    if (stateFilter) {
      const queue = queueClient.underlying;
      let jobs: BullJob[] = [];

      switch (stateFilter) {
        case "waiting":
          jobs = await queue.getWaiting(0, limit - 1);
          break;
        case "active":
          jobs = await queue.getActive(0, limit - 1);
          break;
        case "completed":
          jobs = await queue.getCompleted(0, limit - 1);
          break;
        case "failed":
          jobs = await queue.getFailed(0, limit - 1);
          break;
        case "delayed":
          jobs = await queue.getDelayed(0, limit - 1);
          break;
        default:
          console.error(red(`Invalid state: ${stateFilter}`));
          console.log(dim("Valid states: waiting, active, completed, failed, delayed"));
          process.exit(1);
      }

      if (jobs.length === 0) {
        console.log(dim(`\nNo ${stateFilter} jobs`));
      } else {
        console.log(bold(`\n${stateFilter.toUpperCase()} Jobs (${jobs.length})`));
        for (const job of jobs) {
          console.log(dim("─".repeat(50)));
          console.log(`${bold(job.id || "unknown")} ${dim("│")} ${job.name}`);
          if (job.data?.type) {
            console.log(dim(`  Type: ${job.data.type}`));
          }
          if (job.failedReason) {
            console.log(red(`  Error: ${job.failedReason}`));
          }
        }
      }
    }
  } finally {
    await queueClient.close();
  }
}

/**
 * Run a worker to process jobs
 *
 * swarm queue worker [--concurrency 5] [--sandbox]
 */
async function runWorker(args: string[]) {
  const queueName = args.find((a, i) => args[i - 1] === "--queue") || DEFAULT_QUEUE_NAME;
  const concurrency = parseInt(args.find((a, i) => args[i - 1] === "--concurrency") || "5", 10);
  const enableSandbox = args.includes("--sandbox");

  console.log(bold(cyan("Starting SwarmQueue Worker")));
  console.log(dim("─".repeat(50)));
  console.log(`${bold("Queue:")} ${queueName}`);
  console.log(`${bold("Concurrency:")} ${concurrency}`);
  console.log(`${bold("Sandbox:")} ${enableSandbox ? green("enabled") : dim("disabled")}`);
  console.log(dim("─".repeat(50)));
  console.log(dim("Press Ctrl+C to stop\n"));

  const worker = createSwarmWorker(
    {
      queueName,
      connection: DEFAULT_CONNECTION,
      concurrency,
      enableSandbox,
    },
    async (job, sandbox) => {
      console.log(yellow(`Processing job ${job.id}: ${job.name}`));

      try {
        // Default processor - just echo the payload
        // In real usage, this would dispatch to different handlers based on job.data.type
        const result = {
          success: true,
          data: job.data.payload,
          metadata: {
            processedAt: new Date().toISOString(),
          },
        };

        console.log(green(`Completed job ${job.id}`));
        return result;
      } catch (error: any) {
        console.error(red(`Failed job ${job.id}: ${error.message}`));
        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  // Handle shutdown
  process.on("SIGINT", async () => {
    console.log(yellow("\nShutting down worker..."));
    await worker.close();
    console.log(green("Worker stopped"));
    process.exit(0);
  });

  await worker.start();
  console.log(green("Worker started, processing jobs..."));
}

/**
 * Show help
 */
function showHelp() {
  console.log(bold(cyan("SwarmQueue CLI")));
  console.log(dim("Manage distributed job queue backed by Redis + BullMQ\n"));

  console.log(bold("Commands:"));
  console.log("  swarm queue submit <type> [options]    Submit a job to the queue");
  console.log("    --payload '{...}'                    Job payload (JSON)");
  console.log("    --priority <n>                       Priority (lower = higher, default: 5)");
  console.log("    --delay <ms>                         Delay before processing (default: 0)");
  console.log("    --queue <name>                       Queue name (default: swarm-tasks)\n");

  console.log("  swarm queue status <jobId>             Show job status");
  console.log("    --queue <name>                       Queue name (default: swarm-tasks)\n");

  console.log("  swarm queue list [options]             List jobs and show metrics");
  console.log("    --state <state>                      Filter by state (waiting|active|completed|failed|delayed)");
  console.log("    --limit <n>                          Max jobs to show (default: 10)");
  console.log("    --queue <name>                       Queue name (default: swarm-tasks)\n");

  console.log("  swarm queue worker [options]           Start a worker to process jobs");
  console.log("    --concurrency <n>                    Concurrent jobs (default: 5)");
  console.log("    --sandbox                            Enable resource limits via systemd");
  console.log("    --queue <name>                       Queue name (default: swarm-tasks)\n");

  console.log(bold("Environment Variables:"));
  console.log("  REDIS_HOST                             Redis host (default: localhost)");
  console.log("  REDIS_PORT                             Redis port (default: 6379)");
  console.log("  SWARM_QUEUE_NAME                       Default queue name (default: swarm-tasks)");

  console.log(dim("\nExamples:"));
  console.log(dim('  swarm queue submit process-task --payload \'{"file":"foo.ts"}\''));
  console.log(dim("  swarm queue list --state waiting"));
  console.log(dim("  swarm queue worker --concurrency 10 --sandbox"));
}
