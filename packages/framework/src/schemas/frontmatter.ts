/**
 * SkillFrontmatter — the YAML frontmatter at the top of every SKILL.md.
 *
 * Combines the standard agentskills.io fields (name, description, license,
 * compatibility, metadata) with our framework-specific extensions
 * (mcp_servers, scripts).
 *
 * The framework extensions are stripped from frontmatter before SKILL.md
 * is written to Codex's runtime path — Codex never sees them. Their job
 * is to feed the installer's translation step (mcp_servers → config.toml,
 * scripts → agents/openai.yaml).
 */

import { z } from "zod";
import { McpServerListSchema } from "./mcp-server.js";
import { ScriptListSchema } from "./script.js";

/* ------------------------------------------------------------------ */
/*  Standard agentskills.io fields                                    */
/* ------------------------------------------------------------------ */

/**
 * Skill name — same character set as the open spec. Lowercase letters,
 * digits, hyphens. No leading/trailing hyphens. Must NOT be "anthropic"
 * or "claude" (reserved per Anthropic's guidance, even though we target
 * Codex; this keeps skills portable to other runtimes if we ever
 * reverse the Codex-only decision).
 *
 * The 64-char limit is from the open spec. Going over it tends to be a
 * sign that the name is encoding parameters or context that belongs in
 * the description.
 */
const SKILL_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVED_SKILL_NAMES = new Set(["anthropic", "claude"]);

export const SkillNameSchema = z
  .string()
  .min(1, "skill name must not be empty")
  .max(64, "skill name too long (max 64 chars)")
  .regex(
    SKILL_NAME_REGEX,
    "skill name must be lowercase a-z, 0-9, hyphens (no leading/trailing/double hyphens)",
  )
  .refine(
    (name) => !RESERVED_SKILL_NAMES.has(name),
    (name) => ({
      message: `skill name "${name}" is reserved and cannot be used`,
    }),
  );

export type SkillName = z.infer<typeof SkillNameSchema>;

/**
 * Skill description — the most important field in the entire skill.
 *
 * Hard cap at 1024 chars per the open spec; this is the L1 token budget
 * an agent loads into context for every installed skill, so length
 * directly costs tokens at every agent startup.
 *
 * Empty descriptions are not just rejected, they're rejected with a
 * pointed message — the description is what makes a skill discoverable
 * by the agent. A skill without a description is functionally invisible.
 */
export const SkillDescriptionSchema = z
  .string()
  .min(
    1,
    "description must not be empty — the agent uses this to decide when to activate the skill",
  )
  .max(1024, "description too long (max 1024 chars per agentskills.io spec)");

/**
 * License — free-form string per the open spec. Common values are
 * "MIT", "Apache-2.0", "Internal use only", etc. We don't validate
 * SPDX format because the spec explicitly allows custom strings.
 */
export const LicenseSchema = z.string().min(1).max(256).optional();

/**
 * Compatibility — declares which agent runtimes this skill targets.
 *
 * For now, only Codex is supported by this framework, but the
 * compatibility field is documented in the open spec and skill authors
 * may write it. We accept the field, validate that the agents listed
 * are non-empty strings, and use it informationally — we don't refuse
 * to install a skill that omits "codex" from its compatibility list,
 * because many existing skills don't write this field at all.
 */
const CompatibilitySchema = z
  .object({
    agents: z.array(z.string().min(1)).optional(),
  })
  .passthrough()
  .optional();

/**
 * Metadata — free-form object per the open spec. Skill authors put
 * anything here: version numbers, author contact, change logs, custom
 * extension data. We don't validate the contents (it's user-defined),
 * but we do enforce that it's a plain object (not a string or array)
 * so consumers can rely on the shape.
 */
const MetadataSchema = z.record(z.string(), z.unknown()).optional();

/* ------------------------------------------------------------------ */
/*  The full frontmatter                                              */
/* ------------------------------------------------------------------ */

/**
 * The complete SkillFrontmatter schema.
 *
 * Required: name, description.
 * Optional standard: license, compatibility, metadata.
 * Optional framework extensions: mcp_servers, scripts.
 *
 * `.passthrough()` so YAML keys we don't know about are preserved.
 * Codex / other tools may add their own frontmatter conventions and
 * we shouldn't silently drop them.
 */
export const SkillFrontmatterSchema = z
  .object({
    // Standard
    name: SkillNameSchema,
    description: SkillDescriptionSchema,
    license: LicenseSchema,
    compatibility: CompatibilitySchema,
    metadata: MetadataSchema,

    // Framework extensions
    mcp_servers: McpServerListSchema,
    scripts: ScriptListSchema,
  })
  .passthrough();

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

/* ------------------------------------------------------------------ */
/*  Frontmatter sanitization for runtime install                      */
/* ------------------------------------------------------------------ */

/**
 * The keys this framework adds beyond the open spec. The installer
 * removes these before writing SKILL.md to Codex's runtime path so
 * Codex sees only spec-compliant frontmatter.
 *
 * Centralized here (not hard-coded in the installer) so changes to
 * the framework's extension surface stay in one place.
 */
export const FRAMEWORK_EXTENSION_KEYS = ["mcp_servers", "scripts"] as const;

/**
 * The frontmatter shape that Codex actually sees, post-sanitization.
 * This is what the installer writes; it's also what `skills validate`
 * displays as "what Codex would receive."
 */
export const SanitizedFrontmatterSchema = z
  .object({
    name: SkillNameSchema,
    description: SkillDescriptionSchema,
    license: LicenseSchema,
    compatibility: CompatibilitySchema,
    metadata: MetadataSchema,
  })
  .passthrough();

export type SanitizedFrontmatter = z.infer<typeof SanitizedFrontmatterSchema>;

/**
 * Strip the framework extensions from a parsed frontmatter object.
 * Used by the installer; exposed here so tests can verify the
 * stripping behavior independently.
 */
export function sanitizeFrontmatter(
  fm: SkillFrontmatter,
): SanitizedFrontmatter {
  const out = { ...fm } as Record<string, unknown>;
  for (const k of FRAMEWORK_EXTENSION_KEYS) {
    delete out[k];
  }
  return SanitizedFrontmatterSchema.parse(out);
}
