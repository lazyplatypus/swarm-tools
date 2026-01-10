/**
 * Unit tests for Claude plugin MCP configuration.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { loadToolRegistry } from "../../claude-plugin/bin/swarm-mcp-server";

type McpServerConfig = {
  command: string;
  args: string[];
  cwd?: string;
  description?: string;
};

type McpConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

const PLUGIN_ROOT = resolve(process.cwd(), "claude-plugin");
const MCP_CONFIG_PATH = resolve(PLUGIN_ROOT, ".mcp.json");
const MCP_SERVER_PATH = resolve(PLUGIN_ROOT, "bin", "swarm-mcp-server.ts");

/**
 * Reads the Claude plugin MCP config JSON from disk.
 */
function readMcpConfig(): McpConfig {
  return JSON.parse(readFileSync(MCP_CONFIG_PATH, "utf-8")) as McpConfig;
}

/**
 * Reads the Claude plugin MCP server entrypoint source.
 */
function readMcpServerSource(): string {
  return readFileSync(MCP_SERVER_PATH, "utf-8");
}

describe("claude-plugin MCP config", () => {
  it("locates the MCP config in the plugin root", () => {
    expect(existsSync(MCP_CONFIG_PATH)).toBe(true);
  });

  it("registers the swarm-tools MCP server", () => {
    const config = readMcpConfig();

    expect(config).toHaveProperty("mcpServers");
    expect(config.mcpServers).toHaveProperty("swarm-tools");

    const server = config.mcpServers["swarm-tools"];
    expect(server.command).toBe("bun");
    expect(server.args).toEqual([
      "run",
      "${CLAUDE_PLUGIN_ROOT}/bin/swarm-mcp-server.ts",
    ]);
    expect(server.cwd).toBe("${CLAUDE_PLUGIN_ROOT}");
    expect(server.description).toBeTruthy();
  });

  it("loads runtime tools from the plugin dist bundle", () => {
    const source = readMcpServerSource();

    expect(source).toContain("../dist/index.js");
  });

  it("loads the swarm tool registry from the MCP entrypoint", async () => {
    const tools = await loadToolRegistry();

    expect(Object.keys(tools).length).toBeGreaterThan(0);
    expect(tools).toHaveProperty("hive_ready");
  });
});
