/**
 * parser.ts — reads a skill folder and produces a SkillManifest.
 *
 * Responsibilities:
 * - Read SKILL.md from a given directory
 * - Parse YAML frontmatter with gray-matter
 * - Validate frontmatter against SkillFrontmatterSchema
 * - Resolve declared script paths against the filesystem
 * - Collect warnings (missing scripts, etc.)
 * - Return a validated SkillManifest or throw a descriptive ParseError
 */

import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";
import { ZodError } from "zod";
import { SkillFrontmatterSchema } from "./schemas/frontmatter.js";
import type { SkillManifest } from "./schemas/manifest.js";

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly skillDir: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * Parse a skill folder and return a validated SkillManifest.
 *
 * @param skillDir - Absolute path to the skill folder
 * @throws ParseError if SKILL.md is missing, unreadable, or invalid
 */
export function parseSkill(skillDir: string): SkillManifest {
  const absDir = path.resolve(skillDir);
  const skillMdPath = path.join(absDir, "SKILL.md");

  // ── 1. Read SKILL.md ───────────────────────────────────────────────
  if (!fs.existsSync(skillMdPath)) {
    throw new ParseError(
      `SKILL.md not found in "${absDir}"`,
      absDir,
    );
  }

  let raw: string;
  try {
    raw = fs.readFileSync(skillMdPath, "utf-8");
  } catch (err) {
    throw new ParseError(
      `Failed to read SKILL.md: ${String(err)}`,
      absDir,
      err,
    );
  }

  // ── 2. Parse frontmatter ───────────────────────────────────────────
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(raw);
  } catch (err) {
    throw new ParseError(
      `Failed to parse YAML frontmatter: ${String(err)}`,
      absDir,
      err,
    );
  }

  // ── 3. Validate against schema ─────────────────────────────────────
  const result = SkillFrontmatterSchema.safeParse(parsed.data);
  if (!result.success) {
    const issues = formatZodError(result.error);
    throw new ParseError(
      `Invalid SKILL.md frontmatter:\n${issues}`,
      absDir,
      result.error,
    );
  }

  const frontmatter = result.data;
  const warnings: string[] = [];

  // ── 4. Resolve scripts ─────────────────────────────────────────────
  const resolvedScripts: SkillManifest["resolvedScripts"] = [];

  for (const script of frontmatter.scripts ?? []) {
    const absolutePath = path.resolve(absDir, script.path);
    if (!fs.existsSync(absolutePath)) {
      warnings.push(
        `Script "${script.name}" declared but not found on disk: ${script.path}`,
      );
    } else {
      resolvedScripts.push({ name: script.name, absolutePath });
    }
  }

  return {
    frontmatter,
    skillDir: absDir,
    skillMdPath,
    resolvedScripts,
    warnings,
  };
}

function formatZodError(err: ZodError): string {
  return err.errors
    .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
    .join("\n");
}
