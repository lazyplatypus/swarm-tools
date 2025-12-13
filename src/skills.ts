/**
 * Skills Module for OpenCode
 *
 * Implements Anthropic's Agent Skills specification for OpenCode.
 * Skills are markdown files with YAML frontmatter that provide
 * domain-specific instructions the model can activate when relevant.
 *
 * Discovery locations (in priority order):
 * 1. {projectDir}/.opencode/skills/
 * 2. {projectDir}/.claude/skills/ (compatibility)
 * 3. {projectDir}/skills/ (simple projects)
 *
 * Skill format:
 * ```markdown
 * ---
 * name: my-skill
 * description: What it does. Use when X.
 * ---
 *
 * # Skill Instructions
 * ...
 * ```
 *
 * @module skills
 */

import { tool } from "@opencode-ai/plugin";
import { readdir, readFile, stat } from "fs/promises";
import { join, basename, dirname } from "path";

// =============================================================================
// Types
// =============================================================================

/**
 * Skill metadata from YAML frontmatter
 */
export interface SkillMetadata {
  /** Unique skill identifier (lowercase, hyphens) */
  name: string;
  /** Description of what the skill does and when to use it */
  description: string;
  /** Optional list of tools this skill works with */
  tools?: string[];
  /** Optional tags for categorization */
  tags?: string[];
}

/**
 * Full skill definition including content
 */
export interface Skill {
  /** Parsed frontmatter metadata */
  metadata: SkillMetadata;
  /** Raw markdown body (instructions) */
  body: string;
  /** Absolute path to the SKILL.md file */
  path: string;
  /** Directory containing the skill */
  directory: string;
  /** Whether this skill has executable scripts */
  hasScripts: boolean;
  /** List of script files in the skill directory */
  scripts: string[];
}

/**
 * Lightweight skill reference for listing
 */
export interface SkillRef {
  name: string;
  description: string;
  path: string;
  hasScripts: boolean;
}

// =============================================================================
// State
// =============================================================================

/** Cached project directory for skill discovery */
let skillsProjectDirectory: string = process.cwd();

/** Cached discovered skills (lazy-loaded) */
let skillsCache: Map<string, Skill> | null = null;

/**
 * Set the project directory for skill discovery
 */
export function setSkillsProjectDirectory(dir: string): void {
  skillsProjectDirectory = dir;
  skillsCache = null; // Invalidate cache when directory changes
}

// =============================================================================
// YAML Frontmatter Parser
// =============================================================================

/**
 * Parse YAML frontmatter from markdown content
 *
 * Handles the common frontmatter format:
 * ```
 * ---
 * key: value
 * ---
 * body content
 * ```
 */
export function parseFrontmatter(content: string): {
  metadata: Record<string, unknown>;
  body: string;
} {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: {}, body: content };
  }

  const [, yamlContent, body] = match;
  const metadata: Record<string, unknown> = {};

  // Simple YAML parser for frontmatter (handles key: value and key: [array])
  const lines = yamlContent.split("\n");
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Check for array item
    if (trimmed.startsWith("- ") && currentKey && currentArray !== null) {
      currentArray.push(trimmed.slice(2).trim());
      continue;
    }

    // Check for key: value
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0) {
      // Save previous array if any
      if (currentKey && currentArray !== null) {
        metadata[currentKey] = currentArray;
      }

      currentKey = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();

      if (value === "" || value === "|" || value === ">") {
        // Start of array or multiline
        currentArray = [];
      } else if (value.startsWith("[") && value.endsWith("]")) {
        // Inline array: [a, b, c]
        metadata[currentKey] = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""));
        currentKey = null;
        currentArray = null;
      } else {
        // Simple value (strip quotes)
        metadata[currentKey] = value.replace(/^["']|["']$/g, "");
        currentKey = null;
        currentArray = null;
      }
    }
  }

  // Save final array if any
  if (currentKey && currentArray !== null) {
    metadata[currentKey] = currentArray;
  }

  return { metadata, body: body.trim() };
}

/**
 * Validate and extract skill metadata from parsed frontmatter
 */
function validateSkillMetadata(
  raw: Record<string, unknown>,
  filePath: string
): SkillMetadata {
  const name = raw.name;
  const description = raw.description;

  if (typeof name !== "string" || !name) {
    throw new Error(`Skill at ${filePath} missing required 'name' field`);
  }

  if (typeof description !== "string" || !description) {
    throw new Error(
      `Skill at ${filePath} missing required 'description' field`
    );
  }

  // Validate name format
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(
      `Skill name '${name}' must be lowercase with hyphens only`
    );
  }

  if (name.length > 64) {
    throw new Error(`Skill name '${name}' exceeds 64 character limit`);
  }

  if (description.length > 1024) {
    throw new Error(
      `Skill description for '${name}' exceeds 1024 character limit`
    );
  }

  return {
    name,
    description,
    tools: Array.isArray(raw.tools)
      ? raw.tools.filter((t): t is string => typeof t === "string")
      : undefined,
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((t): t is string => typeof t === "string")
      : undefined,
  };
}

// =============================================================================
// Discovery
// =============================================================================

/**
 * Skill discovery locations relative to project root
 */
const SKILL_DIRECTORIES = [
  ".opencode/skills",
  ".claude/skills",
  "skills",
] as const;

/**
 * Find all SKILL.md files in a directory
 */
async function findSkillFiles(baseDir: string): Promise<string[]> {
  const skillFiles: string[] = [];

  try {
    const entries = await readdir(baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = join(baseDir, entry.name, "SKILL.md");
        try {
          const s = await stat(skillPath);
          if (s.isFile()) {
            skillFiles.push(skillPath);
          }
        } catch {
          // SKILL.md doesn't exist in this subdirectory
        }
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return skillFiles;
}

/**
 * Find script files in a skill directory
 */
async function findSkillScripts(skillDir: string): Promise<string[]> {
  const scripts: string[] = [];
  const scriptsDir = join(skillDir, "scripts");

  try {
    const entries = await readdir(scriptsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        scripts.push(entry.name);
      }
    }
  } catch {
    // No scripts directory
  }

  return scripts;
}

/**
 * Load a skill from its SKILL.md file
 */
async function loadSkill(skillPath: string): Promise<Skill> {
  const content = await readFile(skillPath, "utf-8");
  const { metadata: rawMetadata, body } = parseFrontmatter(content);
  const metadata = validateSkillMetadata(rawMetadata, skillPath);
  const directory = dirname(skillPath);
  const scripts = await findSkillScripts(directory);

  return {
    metadata,
    body,
    path: skillPath,
    directory,
    hasScripts: scripts.length > 0,
    scripts,
  };
}

/**
 * Discover all skills in the project
 */
export async function discoverSkills(
  projectDir?: string
): Promise<Map<string, Skill>> {
  const dir = projectDir || skillsProjectDirectory;

  // Return cached skills if available
  if (skillsCache && !projectDir) {
    return skillsCache;
  }

  const skills = new Map<string, Skill>();
  const seenNames = new Set<string>();

  // Check each skill directory in priority order
  for (const relPath of SKILL_DIRECTORIES) {
    const skillsDir = join(dir, relPath);
    const skillFiles = await findSkillFiles(skillsDir);

    for (const skillPath of skillFiles) {
      try {
        const skill = await loadSkill(skillPath);

        // First definition wins (project overrides user)
        if (!seenNames.has(skill.metadata.name)) {
          skills.set(skill.metadata.name, skill);
          seenNames.add(skill.metadata.name);
        }
      } catch (error) {
        // Log but don't fail on individual skill parse errors
        console.warn(
          `[skills] Failed to load ${skillPath}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  // Cache for future lookups
  if (!projectDir) {
    skillsCache = skills;
  }

  return skills;
}

/**
 * Get a single skill by name
 */
export async function getSkill(name: string): Promise<Skill | null> {
  const skills = await discoverSkills();
  return skills.get(name) || null;
}

/**
 * List all available skills (lightweight refs only)
 */
export async function listSkills(): Promise<SkillRef[]> {
  const skills = await discoverSkills();
  return Array.from(skills.values()).map((skill) => ({
    name: skill.metadata.name,
    description: skill.metadata.description,
    path: skill.path,
    hasScripts: skill.hasScripts,
  }));
}

/**
 * Invalidate the skills cache (call when skills may have changed)
 */
export function invalidateSkillsCache(): void {
  skillsCache = null;
}

// =============================================================================
// Tools
// =============================================================================

/**
 * List available skills with metadata
 *
 * Returns lightweight skill references for the model to evaluate
 * which skills are relevant to the current task.
 */
export const skills_list = tool({
  description: `List all available skills in the project.

Skills are specialized instructions that help with specific domains or tasks.
Use this tool to discover what skills are available, then use skills_use to
activate a relevant skill.

Returns skill names, descriptions, and whether they have executable scripts.`,
  args: {
    tag: tool.schema
      .string()
      .optional()
      .describe("Optional tag to filter skills by"),
  },
  async execute(args) {
    const skills = await discoverSkills();
    let refs = Array.from(skills.values());

    // Filter by tag if provided
    if (args.tag) {
      refs = refs.filter(
        (s) => s.metadata.tags?.includes(args.tag as string)
      );
    }

    if (refs.length === 0) {
      return args.tag
        ? `No skills found with tag '${args.tag}'. Try skills_list without a tag filter.`
        : `No skills found. Skills should be in .opencode/skills/, .claude/skills/, or skills/ directories with SKILL.md files.`;
    }

    const formatted = refs
      .map((s) => {
        const scripts = s.hasScripts ? " [has scripts]" : "";
        const tags = s.metadata.tags?.length
          ? ` (${s.metadata.tags.join(", ")})`
          : "";
        return `• ${s.metadata.name}${tags}${scripts}\n  ${s.metadata.description}`;
      })
      .join("\n\n");

    return `Found ${refs.length} skill(s):\n\n${formatted}`;
  },
});

/**
 * Load and activate a skill by name
 *
 * Loads the full skill content for injection into context.
 * The skill's instructions become available for the model to follow.
 */
export const skills_use = tool({
  description: `Activate a skill by loading its full instructions.

After calling this tool, follow the skill's instructions for the current task.
Skills provide domain-specific guidance and best practices.

If the skill has scripts, you can run them with skills_execute.`,
  args: {
    name: tool.schema.string().describe("Name of the skill to activate"),
    include_scripts: tool.schema
      .boolean()
      .optional()
      .describe("Also list available scripts (default: true)"),
  },
  async execute(args) {
    const skill = await getSkill(args.name);

    if (!skill) {
      const available = await listSkills();
      const names = available.map((s) => s.name).join(", ");
      return `Skill '${args.name}' not found. Available skills: ${names || "none"}`;
    }

    const includeScripts = args.include_scripts !== false;
    let output = `# Skill: ${skill.metadata.name}\n\n`;
    output += `${skill.body}\n`;

    if (includeScripts && skill.scripts.length > 0) {
      output += `\n---\n\n## Available Scripts\n\n`;
      output += `This skill includes the following scripts in ${skill.directory}/scripts/:\n\n`;
      output += skill.scripts.map((s) => `• ${s}`).join("\n");
      output += `\n\nRun scripts with skills_execute tool.`;
    }

    return output;
  },
});

/**
 * Execute a script from a skill
 *
 * Skills can include helper scripts in their scripts/ directory.
 * This tool runs them with appropriate context.
 */
export const skills_execute = tool({
  description: `Execute a script from a skill's scripts/ directory.

Some skills include helper scripts for common operations.
Use skills_use first to see available scripts, then execute them here.

Scripts run in the skill's directory with the project directory as an argument.`,
  args: {
    skill: tool.schema.string().describe("Name of the skill"),
    script: tool.schema
      .string()
      .describe("Name of the script file to execute"),
    args: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Additional arguments to pass to the script"),
  },
  async execute(args, ctx) {
    const skill = await getSkill(args.skill);

    if (!skill) {
      return `Skill '${args.skill}' not found.`;
    }

    if (!skill.scripts.includes(args.script)) {
      return `Script '${args.script}' not found in skill '${args.skill}'. Available: ${skill.scripts.join(", ") || "none"}`;
    }

    const scriptPath = join(skill.directory, "scripts", args.script);
    const scriptArgs = args.args || [];

    try {
      // Use Bun shell from context if available, otherwise exec directly
      const $ = ctx?.$;
      if ($) {
        const result =
          await $`${scriptPath} ${skillsProjectDirectory} ${scriptArgs}`.quiet();
        return result.text();
      } else {
        // Fallback to direct execution
        const { spawn } = await import("child_process");
        return new Promise((resolve) => {
          const proc = spawn(scriptPath, [skillsProjectDirectory, ...scriptArgs], {
            cwd: skill.directory,
            stdio: ["pipe", "pipe", "pipe"],
          });

          let output = "";
          proc.stdout?.on("data", (d) => (output += d.toString()));
          proc.stderr?.on("data", (d) => (output += d.toString()));
          proc.on("close", (code) => {
            if (code === 0) {
              resolve(output || "Script executed successfully.");
            } else {
              resolve(`Script exited with code ${code}:\n${output}`);
            }
          });
          proc.on("error", (err) => {
            resolve(`Failed to execute script: ${err.message}`);
          });
        });
      }
    } catch (error) {
      return `Failed to execute script: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

/**
 * Read a resource file from a skill directory
 *
 * Skills can include additional resources like examples, templates, or reference docs.
 */
export const skills_read = tool({
  description: `Read a resource file from a skill's directory.

Skills may include additional files like:
- examples.md - Example usage
- reference.md - Reference documentation
- templates/ - Template files

Use this to access supplementary skill resources.`,
  args: {
    skill: tool.schema.string().describe("Name of the skill"),
    file: tool.schema
      .string()
      .describe("Relative path to the file within the skill directory"),
  },
  async execute(args) {
    const skill = await getSkill(args.skill);

    if (!skill) {
      return `Skill '${args.skill}' not found.`;
    }

    // Security: prevent path traversal
    if (args.file.includes("..") || args.file.startsWith("/")) {
      return "Invalid file path. Use relative paths without '..'";
    }

    const filePath = join(skill.directory, args.file);

    try {
      const content = await readFile(filePath, "utf-8");
      return content;
    } catch (error) {
      return `Failed to read '${args.file}' from skill '${args.skill}': ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

// =============================================================================
// Tool Registry
// =============================================================================

/**
 * All skills tools for plugin registration
 */
export const skillsTools = {
  skills_list,
  skills_use,
  skills_execute,
  skills_read,
};

// =============================================================================
// Swarm Integration
// =============================================================================

/**
 * Get skill context for swarm task decomposition
 *
 * Returns a summary of available skills that can be referenced
 * in subtask prompts for specialized handling.
 */
export async function getSkillsContextForSwarm(): Promise<string> {
  const skills = await listSkills();

  if (skills.length === 0) {
    return "";
  }

  const skillsList = skills
    .map((s) => `- ${s.name}: ${s.description}`)
    .join("\n");

  return `
## Available Skills

The following skills are available in this project and can be activated
with \`skills_use\` when relevant to subtasks:

${skillsList}

Consider which skills may be helpful for each subtask.`;
}

/**
 * Find skills relevant to a task description
 *
 * Simple keyword matching to suggest skills for a task.
 * Returns skill names that may be relevant.
 */
export async function findRelevantSkills(
  taskDescription: string
): Promise<string[]> {
  const skills = await discoverSkills();
  const relevant: string[] = [];
  const taskLower = taskDescription.toLowerCase();

  for (const [name, skill] of skills) {
    const descLower = skill.metadata.description.toLowerCase();
    const bodyLower = skill.body.toLowerCase();

    // Check if task matches skill description keywords
    const keywords = descLower.split(/\s+/).filter((w) => w.length > 4);
    const taskWords = taskLower.split(/\s+/);

    const matches = keywords.filter((k) =>
      taskWords.some((w) => w.includes(k) || k.includes(w))
    );

    // Also check tags
    const tagMatches =
      skill.metadata.tags?.filter((t) => taskLower.includes(t.toLowerCase())) ||
      [];

    if (matches.length >= 2 || tagMatches.length > 0) {
      relevant.push(name);
    }
  }

  return relevant;
}
