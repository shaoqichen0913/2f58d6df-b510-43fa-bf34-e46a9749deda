/**
 * ScriptDecl — declaration of an executable script bundled with a skill.
 *
 * Scripts live in the `scripts/` directory of the skill folder and can be
 * invoked by the script executor (dev mode) or by Codex itself via its
 * shell tools (production mode).
 *
 * In SKILL.md frontmatter:
 *
 * ```yaml
 * scripts:
 *   - name: format-result
 *     path: scripts/format.sh
 *     description: Format raw search results into readable markdown
 *     timeout_sec: 60
 * ```
 */

import { z } from "zod";

/**
 * Script identifier — referenced from `skills run <skill> <script-name>`.
 *
 * Same character set as the skill name (`agentskills.io` convention):
 * lowercase letters, digits, hyphens. No leading/trailing hyphens.
 *
 * Length is capped at 64 chars to match the skill name limit; longer names
 * are usually a sign that someone is encoding parameters into the script
 * name rather than passing them as args.
 */
const SCRIPT_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const ScriptNameSchema = z
  .string()
  .min(1, "script name must not be empty")
  .max(64, "script name too long (max 64 chars)")
  .regex(
    SCRIPT_NAME_REGEX,
    "script name must be lowercase a-z, 0-9, and hyphens (no leading/trailing/double hyphens)",
  );

export type ScriptName = z.infer<typeof ScriptNameSchema>;

/**
 * Script path — must be relative, must point inside the skill folder.
 *
 * Absolute paths are rejected because they break portability (the skill
 * couldn't be installed to another location). Path traversal (`..`) is
 * rejected for the same reason and as a defensive measure.
 *
 * The actual file existence check happens at parse time (parser.ts), not
 * here — this schema only validates the *shape* of the path string. The
 * filesystem check is a separate concern with separate failure modes.
 */
const RelativePathSchema = z
  .string()
  .min(1, "script path must not be empty")
  .refine(
    (p) => !p.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(p),
    "script path must be relative (no leading slash or drive letter)",
  )
  .refine(
    (p) => !p.split(/[\\/]+/).includes(".."),
    "script path must not contain '..' segments",
  );

/**
 * Script timeout — bounded to prevent runaway scripts.
 *
 * Lower bound (1s) catches off-by-1000 mistakes (someone meant ms).
 * Upper bound (1 hour) is a hard ceiling; longer-running work should be
 * factored into a separate background process, not a skill script.
 *
 * Default is 30s, set in the schema `.default(30)` so callers don't have
 * to specify it for typical scripts.
 */
const TimeoutSecSchema = z
  .number()
  .int("timeout must be an integer number of seconds")
  .min(1, "timeout must be at least 1 second")
  .max(3600, "timeout must be at most 3600 seconds (1 hour)")
  .default(30);

/**
 * One entry under `scripts:` in SKILL.md frontmatter.
 *
 * `description` is optional but strongly recommended — it's what surfaces
 * in `skills list` and in the generated `agents/openai.yaml` for Codex.
 * Skills without script descriptions are harder for the agent to use
 * (Codex can call the script but doesn't know when to call it).
 */
export const ScriptDeclSchema = z.object({
  name: ScriptNameSchema,
  path: RelativePathSchema,
  description: z.string().min(1).max(512).optional(),
  timeout_sec: TimeoutSecSchema,
});

export type ScriptDecl = z.infer<typeof ScriptDeclSchema>;

/**
 * The full `scripts` array. Empty array is allowed (most skills have no
 * scripts); a skill with `scripts: []` and one with `scripts:` omitted
 * are equivalent.
 *
 * Within an array, script names must be unique. The check is in a
 * `superRefine` rather than the element schema because uniqueness is a
 * collection-level constraint.
 */
export const ScriptListSchema = z
  .array(ScriptDeclSchema)
  .default([])
  .superRefine((scripts, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < scripts.length; i++) {
      const name = scripts[i].name;
      if (seen.has(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, "name"],
          message: `duplicate script name: "${name}"`,
        });
      }
      seen.add(name);
    }
  });

export type ScriptList = z.infer<typeof ScriptListSchema>;
