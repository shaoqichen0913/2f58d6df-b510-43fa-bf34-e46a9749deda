/**
 * ActivationResult — output of the activator for a given user query.
 *
 * The activator takes a query string + all installed skill manifests and
 * returns an ordered list of skills it thinks should activate, plus
 * the reasoning (for dev-time transparency).
 */

import { z } from "zod";

export const ActivatedSkillSchema = z.object({
  /** Skill name. */
  name: z.string(),

  /** Confidence score 0–1. LLM judge returns this; keyword fallback uses overlap ratio. */
  score: z.number().min(0).max(1),

  /** Human-readable explanation of why this skill was selected. */
  reason: z.string(),
});

export type ActivatedSkill = z.infer<typeof ActivatedSkillSchema>;

export const ActivationResultSchema = z.object({
  /** The original user query. */
  query: z.string(),

  /** Skills selected, ordered by score descending. */
  activated: z.array(ActivatedSkillSchema),

  /** Which strategy was used. */
  strategy: z.enum(["llm-judge", "keyword"]),

  /** Which model was used (only set when strategy is llm-judge). */
  model: z.string().optional(),
});

export type ActivationResult = z.infer<typeof ActivationResultSchema>;
