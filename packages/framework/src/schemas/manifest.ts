/**
 * SkillManifest — the runtime representation of an installed skill.
 *
 * Produced by the parser after reading and validating a skill folder.
 * Contains both the parsed frontmatter and filesystem metadata needed
 * by the installer, activator, and executor.
 */

import { z } from "zod";
import { SkillFrontmatterSchema } from "./frontmatter.js";

export const SkillManifestSchema = z.object({
  /** Parsed, validated frontmatter. */
  frontmatter: SkillFrontmatterSchema,

  /** Absolute path to the skill folder (contains SKILL.md). */
  skillDir: z.string().min(1),

  /** Absolute path to the SKILL.md file. */
  skillMdPath: z.string().min(1),

  /**
   * Resolved absolute paths of declared scripts that were found on disk.
   * Scripts declared in frontmatter but missing from disk are reported
   * as validation warnings, not errors — the skill is still usable
   * (the agent can decide not to call the missing script).
   */
  resolvedScripts: z.array(
    z.object({
      name: z.string(),
      absolutePath: z.string(),
    })
  ),

  /**
   * Validation warnings produced during parsing.
   * Non-fatal issues: missing optional scripts, unknown frontmatter keys
   * that might indicate a typo, etc.
   */
  warnings: z.array(z.string()),
});

export type SkillManifest = z.infer<typeof SkillManifestSchema>;

/** Lightweight summary for listing. */
export interface SkillSummary {
  name: string;
  description: string;
  skillDir: string;
  mcpServerCount: number;
  scriptCount: number;
  warnings: string[];
}

export function toSummary(manifest: SkillManifest): SkillSummary {
  return {
    name: manifest.frontmatter.name,
    description: manifest.frontmatter.description,
    skillDir: manifest.skillDir,
    mcpServerCount: manifest.frontmatter.mcp_servers?.length ?? 0,
    scriptCount: manifest.frontmatter.scripts?.length ?? 0,
    warnings: manifest.warnings,
  };
}
