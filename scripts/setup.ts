#!/usr/bin/env bun
/**
 * OpenCode Swarm Plugin - Setup Script
 *
 * Checks for required dependencies and installs them if missing.
 * Mac-specific (uses Homebrew).
 *
 * Usage:
 *   bunx opencode-swarm-plugin/scripts/setup.ts
 *   # or after cloning:
 *   bun scripts/setup.ts
 */

import { $ } from "bun";
import { existsSync, mkdirSync, copyFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ANSI colors
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const blue = (s: string) => `\x1b[34m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const CHECK = green("✓");
const CROSS = red("✗");
const WARN = yellow("⚠");
const INFO = blue("→");

interface Dependency {
  name: string;
  check: () => Promise<boolean>;
  install: () => Promise<void>;
  optional?: boolean;
  purpose: string;
}

/**
 * Check if a command exists
 */
async function commandExists(cmd: string): Promise<boolean> {
  try {
    const result = await $`which ${cmd}`.quiet().nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Check if a URL is reachable
 */
async function urlReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Run a shell command with output
 */
async function run(cmd: string, args: string[] = []): Promise<boolean> {
  try {
    const proc = Bun.spawn([cmd, ...args], {
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

const dependencies: Dependency[] = [
  {
    name: "Homebrew",
    purpose: "Package manager for installing other dependencies",
    check: async () => commandExists("brew"),
    install: async () => {
      console.log(`${INFO} Installing Homebrew...`);
      const script = await fetch(
        "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh",
      ).then((r) => r.text());
      await $`/bin/bash -c ${script}`;
    },
  },
  {
    name: "OpenCode",
    purpose: "AI coding assistant (plugin host)",
    check: async () => commandExists("opencode"),
    install: async () => {
      console.log(`${INFO} Installing OpenCode...`);
      await run("brew", ["install", "sst/tap/opencode"]);
    },
  },
  {
    name: "Beads CLI (bd)",
    purpose: "Git-backed issue tracking",
    check: async () => commandExists("bd"),
    install: async () => {
      console.log(`${INFO} Installing Beads...`);
      // Try npm global install first
      const npmResult = await $`npm install -g @joelhooks/beads`
        .quiet()
        .nothrow();
      if (npmResult.exitCode !== 0) {
        console.log(`${WARN} npm install failed, trying go install...`);
        await run("go", [
          "install",
          "github.com/joelhooks/beads/cmd/bd@latest",
        ]);
      }
    },
  },
  {
    name: "Agent Mail MCP",
    purpose: "Multi-agent coordination server",
    check: async () => {
      // Check if server is running
      const running = await urlReachable(
        "http://127.0.0.1:8765/health/liveness",
      );
      if (running) return true;
      // Check if binary exists
      return commandExists("agent-mail");
    },
    install: async () => {
      console.log(`${INFO} Installing Agent Mail...`);
      console.log(dim("  Agent Mail requires manual setup:"));
      console.log(
        dim("  1. Clone: git clone https://github.com/joelhooks/agent-mail"),
      );
      console.log(
        dim("  2. Build: cd agent-mail && go build -o agent-mail ./cmd/server"),
      );
      console.log(dim("  3. Run: ./agent-mail serve"));
      console.log();
      console.log(
        `${WARN} Skipping automatic install - see instructions above`,
      );
    },
    optional: true,
  },
  {
    name: "Redis",
    purpose: "Rate limiting (optional, falls back to SQLite)",
    check: async () => {
      // Check if redis-server is running or installed
      const running = await $`redis-cli ping`.quiet().nothrow();
      if (running.exitCode === 0) return true;
      return commandExists("redis-server");
    },
    install: async () => {
      console.log(`${INFO} Installing Redis...`);
      await run("brew", ["install", "redis"]);
      console.log(dim("  Start with: brew services start redis"));
    },
    optional: true,
  },
  {
    name: "CASS (cass-memory)",
    purpose: "Cross-agent session search for historical context",
    check: async () => commandExists("cass"),
    install: async () => {
      console.log(`${INFO} CASS installation...`);
      console.log(
        dim("  Install from: https://github.com/Dicklesworthstone/cass"),
      );
      console.log(`${WARN} Skipping automatic install - see link above`);
    },
    optional: true,
  },
  {
    name: "UBS (bug scanner)",
    purpose: "Pre-completion bug scanning",
    check: async () => commandExists("ubs"),
    install: async () => {
      console.log(`${INFO} UBS installation...`);
      console.log(dim("  UBS is bundled with OpenCode plugins"));
      console.log(
        `${WARN} Skipping - should be available if OpenCode is installed`,
      );
    },
    optional: true,
  },
];

/**
 * Setup OpenCode directories and copy plugin
 */
async function setupOpenCodeDirs(): Promise<void> {
  const configDir = join(homedir(), ".config", "opencode");
  const pluginsDir = join(configDir, "plugins");
  const commandsDir = join(configDir, "commands");
  const agentsDir = join(configDir, "agents");

  // Create directories
  for (const dir of [pluginsDir, commandsDir, agentsDir]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`${CHECK} Created ${dir}`);
    }
  }

  // Find plugin files (either in node_modules or local)
  const possiblePaths = [
    join(process.cwd(), "dist", "plugin.js"),
    join(
      process.cwd(),
      "node_modules",
      "opencode-swarm-plugin",
      "dist",
      "plugin.js",
    ),
  ];

  let pluginSrc: string | null = null;
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      pluginSrc = p;
      break;
    }
  }

  if (pluginSrc) {
    const pluginDest = join(pluginsDir, "swarm.js");
    copyFileSync(pluginSrc, pluginDest);
    console.log(`${CHECK} Copied plugin to ${pluginDest}`);
  } else {
    console.log(
      `${WARN} Plugin not found - run 'pnpm build' first or install from npm`,
    );
  }

  // Copy example files if they exist
  const examplesDir = join(process.cwd(), "examples");
  const nodeModulesExamples = join(
    process.cwd(),
    "node_modules",
    "opencode-swarm-plugin",
    "examples",
  );

  const examplesSrc = existsSync(examplesDir)
    ? examplesDir
    : nodeModulesExamples;

  if (existsSync(examplesSrc)) {
    const swarmCmd = join(examplesSrc, "commands", "swarm.md");
    const plannerAgent = join(examplesSrc, "agents", "swarm-planner.md");

    if (existsSync(swarmCmd)) {
      copyFileSync(swarmCmd, join(commandsDir, "swarm.md"));
      console.log(`${CHECK} Copied /swarm command`);
    }

    if (existsSync(plannerAgent)) {
      copyFileSync(plannerAgent, join(agentsDir, "swarm-planner.md"));
      console.log(`${CHECK} Copied @swarm-planner agent`);
    }
  }
}

/**
 * Main setup function
 */
async function main() {
  console.log();
  console.log(
    blue("═══════════════════════════════════════════════════════════"),
  );
  console.log(blue("  OpenCode Swarm Plugin - Setup"));
  console.log(
    blue("═══════════════════════════════════════════════════════════"),
  );
  console.log();

  // Check platform
  if (process.platform !== "darwin") {
    console.log(
      `${WARN} This script is optimized for macOS. Some installs may not work.`,
    );
    console.log();
  }

  // Check dependencies
  console.log(blue("Checking dependencies...\n"));

  const missing: Dependency[] = [];
  const optionalMissing: Dependency[] = [];

  for (const dep of dependencies) {
    const installed = await dep.check();
    const status = installed ? CHECK : dep.optional ? WARN : CROSS;
    const suffix = dep.optional ? dim(" (optional)") : "";

    console.log(`${status} ${dep.name}${suffix}`);
    console.log(dim(`    ${dep.purpose}`));

    if (!installed) {
      if (dep.optional) {
        optionalMissing.push(dep);
      } else {
        missing.push(dep);
      }
    }
  }

  console.log();

  // Install missing required dependencies
  if (missing.length > 0) {
    console.log(blue("Installing missing required dependencies...\n"));

    for (const dep of missing) {
      try {
        await dep.install();
        const nowInstalled = await dep.check();
        if (nowInstalled) {
          console.log(`${CHECK} ${dep.name} installed successfully\n`);
        } else {
          console.log(`${CROSS} ${dep.name} installation may have failed\n`);
        }
      } catch (error) {
        console.log(`${CROSS} Failed to install ${dep.name}: ${error}\n`);
      }
    }
  }

  // Offer to install optional dependencies
  if (optionalMissing.length > 0) {
    console.log(yellow("Optional dependencies not installed:"));
    for (const dep of optionalMissing) {
      console.log(`  - ${dep.name}: ${dep.purpose}`);
    }
    console.log();
    console.log(
      dim("The plugin will work without these, with degraded features."),
    );
    console.log();
  }

  // Setup OpenCode directories
  console.log(blue("Setting up OpenCode directories...\n"));
  await setupOpenCodeDirs();

  console.log();
  console.log(
    blue("═══════════════════════════════════════════════════════════"),
  );
  console.log(blue("  Setup Complete!"));
  console.log(
    blue("═══════════════════════════════════════════════════════════"),
  );
  console.log();
  console.log("Next steps:");
  console.log(
    `  1. ${dim("Start Agent Mail (if using multi-agent):")} agent-mail serve`,
  );
  console.log(`  2. ${dim("Initialize beads in your project:")} bd init`);
  console.log(`  3. ${dim("Start OpenCode:")} opencode`);
  console.log(`  4. ${dim("Try the swarm command:")} /swarm "your task here"`);
  console.log();
}

main().catch(console.error);
