/**
 * discovery.ts — walk filesystem roots and collect all skills.
 *
 * A "skill root" is a directory whose immediate children are skill folders
 * (each containing SKILL.md). The framework supports multiple roots so
 * project-local and user-global skills coexist without conflict.
 *
 * Discovery is non-fatal: parse errors are collected as diagnostics and
 * the walk continues. This lets the CLI show all broken skills at once
 * instead of stopping at the first error.
 */

import * as fs from "fs";
import * as path from "path";
import { parseSkill, ParseError } from "./parser.js";
import type { SkillManifest } from "./schemas/manifest.js";

export interface DiscoveryDiagnostic {
  skillDir: string;
  error: string;
}

export interface DiscoveryResult {
  /** Successfully parsed skills, deduplicated by name (first-seen wins). */
  skills: SkillManifest[];
  /**
   * Skills that failed to parse. Returned so the CLI can display them
   * rather than silently dropping them.
   */
  diagnostics: DiscoveryDiagnostic[];
  /**
   * Skills whose names collided across roots. Later entries lose;
   * reported here for visibility.
   */
  conflicts: Array<{ name: string; kept: string; skipped: string }>;
}

/**
 * Discover all skills under the given root directories.
 *
 * Each root is expected to contain skill folders as immediate children:
 *
 *   <root>/
 *     knowledge-retriever/SKILL.md
 *     code-reviewer/SKILL.md
 *     ...
 *
 * Roots are searched in order; earlier roots take priority on name conflicts.
 *
 * @param roots - Absolute paths to skill root directories
 */
export function discoverSkills(roots: string[]): DiscoveryResult {
  const skills: SkillManifest[] = [];
  const diagnostics: DiscoveryDiagnostic[] = [];
  const conflicts: DiscoveryResult["conflicts"] = [];
  const seenNames = new Map<string, string>(); // name → skillDir

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      // Root is unreadable — skip silently (e.g. permissions)
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(root, entry.name);

      // Skip if no SKILL.md (not a skill folder)
      if (!fs.existsSync(path.join(skillDir, "SKILL.md"))) continue;

      let manifest: SkillManifest;
      try {
        manifest = parseSkill(skillDir);
      } catch (err) {
        diagnostics.push({
          skillDir,
          error: err instanceof ParseError ? err.message : String(err),
        });
        continue;
      }

      const { name } = manifest.frontmatter;
      if (seenNames.has(name)) {
        conflicts.push({
          name,
          kept: seenNames.get(name)!,
          skipped: skillDir,
        });
        continue;
      }

      seenNames.set(name, skillDir);
      skills.push(manifest);
    }
  }

  return { skills, diagnostics, conflicts };
}

/**
 * Convenience: discover a single skill folder (wraps parseSkill for
 * callers that already know the exact path).
 */
export { parseSkill } from "./parser.js";
