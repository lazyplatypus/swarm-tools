/**
 * Resource-limited process execution using nice, ulimit, and optionally systemd-run
 *
 * Provides sandboxing capabilities for job handlers with:
 * - CPU priority control via nice
 * - Memory limits via ulimit -v
 * - Timeout enforcement
 * - Optional cgroup isolation via systemd-run --user --scope
 */

import { spawn } from "child_process";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

/**
 * Configuration for sandboxed process execution
 */
export interface SandboxConfig {
  /**
   * CPU nice level (-20 to 19, higher = lower priority)
   * Default: 10 (lower priority than normal)
   */
  cpuNice?: number;

  /**
   * Memory limit in megabytes
   * Applied via ulimit -v (virtual memory limit)
   */
  memoryLimitMB?: number;

  /**
   * Job timeout in milliseconds
   * Process will be killed if it exceeds this duration
   */
  timeoutMs?: number;

  /**
   * Use systemd-run for cgroup isolation
   * Requires systemd and user session support
   * Default: false
   */
  useSystemd?: boolean;

  /**
   * Working directory for the process
   */
  cwd?: string;

  /**
   * Environment variables for the process
   */
  env?: Record<string, string>;
}

/**
 * Result from sandboxed process execution
 */
export interface SandboxResult {
  /**
   * Exit code from the process
   */
  exitCode: number;

  /**
   * Stdout output
   */
  stdout: string;

  /**
   * Stderr output
   */
  stderr: string;

  /**
   * Whether the process was killed due to timeout
   */
  timedOut: boolean;

  /**
   * Signal that terminated the process (if any)
   */
  signal?: string;
}

/**
 * Check if systemd-run is available and user session is active
 */
export async function isSystemdAvailable(): Promise<boolean> {
  try {
    // Check if systemd-run exists
    await execAsync("which systemd-run");

    // Check if user session is active
    const { stdout } = await execAsync("systemctl --user is-system-running 2>/dev/null || echo degraded");
    const status = stdout.trim();

    return status === "running" || status === "degraded";
  } catch {
    return false;
  }
}

/**
 * Run a command in a sandboxed environment with resource limits
 *
 * @param command - Command to execute
 * @param args - Command arguments
 * @param config - Sandbox configuration
 * @returns Promise resolving to execution result
 */
export async function runSandboxed(
  command: string,
  args: string[] = [],
  config: SandboxConfig = {}
): Promise<SandboxResult> {
  const {
    cpuNice = 10,
    memoryLimitMB,
    timeoutMs,
    useSystemd = false,
    cwd,
    env = {},
  } = config;

  // Build the command chain
  const cmdParts: string[] = [];

  // Use systemd-run if requested and available
  if (useSystemd) {
    const systemdAvailable = await isSystemdAvailable();
    if (systemdAvailable) {
      // systemd-run --user --scope --quiet
      cmdParts.push("systemd-run", "--user", "--scope", "--quiet");

      // Add memory limit via systemd property (convert MB to bytes)
      // Note: Nice property isn't universally supported in systemd-run
      // We'll use the nice command fallback for CPU priority instead
      if (memoryLimitMB) {
        const memoryBytes = memoryLimitMB * 1024 * 1024;
        cmdParts.push(`--property=MemoryMax=${memoryBytes}`);
      }
    }
  }

  // Add nice for CPU priority (works with or without systemd)
  if (cpuNice !== 0) {
    cmdParts.push("nice", "-n", cpuNice.toString());
  }

  // Build ulimit wrapper for memory limits (if not using systemd)
  let bashWrapper: string | undefined;
  if (memoryLimitMB && (!useSystemd || cmdParts.length === 0)) {
    const memoryKB = memoryLimitMB * 1024;
    // Use bash to apply ulimit before exec
    bashWrapper = `ulimit -v ${memoryKB}; exec "$@"`;
  }

  // Construct final command
  let finalCommand: string;
  let finalArgs: string[];

  if (bashWrapper) {
    finalCommand = "bash";
    finalArgs = ["-c", bashWrapper, "--", ...cmdParts, command, ...args];
  } else if (cmdParts.length > 0) {
    finalCommand = cmdParts[0];
    finalArgs = [...cmdParts.slice(1), command, ...args];
  } else {
    finalCommand = command;
    finalArgs = args;
  }

  // Spawn the process
  return new Promise<SandboxResult>((resolve) => {
    const child = spawn(finalCommand, finalArgs, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | undefined;

    // Set up timeout
    if (timeoutMs) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");

        // Force kill after 5 seconds if still alive
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 5000);
      }, timeoutMs);
    }

    // Collect output
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    // Handle completion
    child.on("close", (exitCode, signal) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      resolve({
        exitCode: exitCode ?? (signal ? 1 : 0),
        stdout,
        stderr,
        timedOut,
        signal: signal ?? undefined,
      });
    });

    // Handle errors
    child.on("error", (error) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      resolve({
        exitCode: 1,
        stdout,
        stderr: stderr + "\n" + error.message,
        timedOut,
      });
    });
  });
}

/**
 * Default sandbox configuration for typical job processing
 */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  cpuNice: 10,
  memoryLimitMB: 512,
  timeoutMs: 5 * 60 * 1000, // 5 minutes
  useSystemd: false,
};
