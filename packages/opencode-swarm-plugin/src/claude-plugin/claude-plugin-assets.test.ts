/**
 * Unit tests for Claude plugin runtime asset copying.
 */
import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { copyClaudePluginRuntimeAssets } from "./claude-plugin-assets";

type PackageManifest = {
  files?: string[];
};

const BUILD_SCRIPT_PATH = join(process.cwd(), "scripts", "build.ts");

/**
 * Reads the package manifest for published file assertions.
 */
function readPackageManifest(): PackageManifest {
  const manifestPath = join(process.cwd(), "package.json");
  return JSON.parse(readFileSync(manifestPath, "utf-8")) as PackageManifest;
}

/**
 * Reads the build script source for packaging checks.
 */
function readBuildScript(): string {
  return readFileSync(BUILD_SCRIPT_PATH, "utf-8");
}

describe("claude-plugin runtime assets", () => {
  it("publishes the claude-plugin runtime dist", () => {
    const manifest = readPackageManifest();

    expect(manifest.files).toContain("claude-plugin/dist");
    expect(manifest.files).toContain("claude-plugin");
  });

  it("syncs claude-plugin runtime assets during build", () => {
    const source = readBuildScript();

    expect(source).toContain("copyClaudePluginRuntimeAssets");
    expect(source).toContain("claude-plugin/dist");
  });

  it("throws if the runtime bundle is missing", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "swarm-plugin-"));

    try {
      const distRoot = join(workspaceRoot, "dist");
      mkdirSync(distRoot, { recursive: true });

      expect(() =>
        copyClaudePluginRuntimeAssets({ packageRoot: workspaceRoot }),
      ).toThrowError(/Missing runtime bundle/);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("copies the runtime bundle into claude-plugin/dist", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "swarm-plugin-"));

    try {
      const distRoot = join(workspaceRoot, "dist");
      const pluginRoot = join(workspaceRoot, "claude-plugin");
      const pluginDist = join(pluginRoot, "dist");

      mkdirSync(distRoot, { recursive: true });
      mkdirSync(pluginRoot, { recursive: true });
      mkdirSync(join(distRoot, "schemas"), { recursive: true });

      writeFileSync(join(distRoot, "index.js"), "runtime-bundle");
      writeFileSync(join(distRoot, "schemas", "tools.json"), "{}");

      mkdirSync(pluginDist, { recursive: true });
      writeFileSync(join(pluginDist, "stale.txt"), "old");

      copyClaudePluginRuntimeAssets({ packageRoot: workspaceRoot });

      expect(existsSync(join(pluginRoot, "dist", "index.js"))).toBe(true);
      expect(readFileSync(join(pluginRoot, "dist", "index.js"), "utf-8")).toBe(
        "runtime-bundle",
      );
      expect(existsSync(join(pluginRoot, "dist", "schemas", "tools.json"))).toBe(
        true,
      );
      expect(existsSync(join(pluginRoot, "dist", "stale.txt"))).toBe(false);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
