/**
 * keyword.ts — keyword-overlap fallback activator.
 *
 * Scores each skill by how many unique words from the query appear in
 * the skill's name + description. Simple but fast — no API calls needed.
 * Used as a fallback when no LLM API key is available.
 */

import type { SkillManifest } from "../schemas/manifest.js";
import type { ActivationResult } from "../schemas/activation.js";

const STOP_WORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being",
  "have","has","had","do","does","did","will","would","could",
  "should","may","might","shall","can","need","dare","ought",
  "i","me","my","we","our","you","your","it","its","they",
  "them","their","this","that","these","those","and","or","but",
  "if","in","on","at","to","for","of","with","by","from","about",
  "into","through","during","before","after","above","below",
  "how","what","when","where","who","which","find","get","show",
  "me","please","want","need","give","tell","help","make","create",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

export function keywordActivate(
  query: string,
  skills: SkillManifest[],
  threshold = 0.0,
): ActivationResult {
  const queryTokens = tokenize(query);

  const scored = skills
    .map((manifest) => {
      const skillTokens = tokenize(
        `${manifest.frontmatter.name} ${manifest.frontmatter.description}`,
      );
      if (queryTokens.size === 0 || skillTokens.size === 0) {
        return { manifest, score: 0, matchedWords: [] as string[] };
      }

      const matched = [...queryTokens].filter((t) => skillTokens.has(t));
      // Jaccard-like: matched / union
      const union = new Set([...queryTokens, ...skillTokens]);
      const score = matched.length / union.size;

      return { manifest, score, matchedWords: matched };
    })
    .filter((r) => r.score > threshold)
    .sort((a, b) => b.score - a.score);

  return {
    query,
    activated: scored.map(({ manifest, score, matchedWords }) => ({
      name: manifest.frontmatter.name,
      score: Math.round(score * 1000) / 1000,
      reason:
        matchedWords.length > 0
          ? `Matched keywords: ${matchedWords.slice(0, 5).join(", ")}`
          : "No keyword overlap",
    })),
    strategy: "keyword",
  };
}
