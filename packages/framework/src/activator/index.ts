/**
 * activator/index.ts — selects the right strategy and runs activation.
 *
 * Strategy selection:
 *   - OPENAI_API_KEY or ANTHROPIC_API_KEY present → llm-judge
 *   - Otherwise → keyword (no API calls)
 *
 * The --strategy flag on the CLI can override this.
 */

import { llmJudgeActivate } from "./llm-judge.js";
import { keywordActivate } from "./keyword.js";
import type { SkillManifest } from "../schemas/manifest.js";
import type { ActivationResult } from "../schemas/activation.js";

export type ActivationStrategy = "auto" | "llm-judge" | "keyword";

export async function activate(
  query: string,
  skills: SkillManifest[],
  strategy: ActivationStrategy = "auto",
): Promise<ActivationResult> {
  if (skills.length === 0) {
    return { query, activated: [], strategy: "keyword" };
  }

  const resolved =
    strategy === "auto"
      ? process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY
        ? "llm-judge"
        : "keyword"
      : strategy;

  if (resolved === "llm-judge") {
    try {
      return await llmJudgeActivate(query, skills);
    } catch (err) {
      // Graceful fallback: log and use keyword
      console.warn(
        `[activator] LLM judge failed (${String(err)}), falling back to keyword strategy`,
      );
      return keywordActivate(query, skills);
    }
  }

  return keywordActivate(query, skills);
}

export { keywordActivate } from "./keyword.js";
export { llmJudgeActivate } from "./llm-judge.js";
