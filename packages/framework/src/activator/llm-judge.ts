/**
 * llm-judge.ts — LLM-as-judge activator.
 *
 * Sends all skill descriptions + the query to an LLM and asks it to
 * return a JSON array of { name, score, reason } entries — mirroring
 * how Codex itself selects skills in production.
 *
 * Supports OpenAI and Anthropic APIs. Priority:
 *   1. OPENAI_API_KEY  → gpt-4o-mini (fast, cheap, sufficient)
 *   2. ANTHROPIC_API_KEY → claude-haiku-4-5-20251001
 */

import type { SkillManifest } from "../schemas/manifest.js";
import type { ActivationResult, ActivatedSkill } from "../schemas/activation.js";

const OPENAI_MODEL = "gpt-4o-mini";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

function buildPrompt(query: string, skills: SkillManifest[]): string {
  const skillList = skills
    .map(
      (m) =>
        `- name: ${m.frontmatter.name}\n  description: ${m.frontmatter.description}`,
    )
    .join("\n");

  return `You are an agent skill router. Given a user query, decide which skills should activate.

Available skills:
${skillList}

User query: "${query}"

Return ONLY a JSON array (no markdown, no explanation) with this exact shape:
[
  { "name": "<skill-name>", "score": <0.0-1.0>, "reason": "<one sentence>" },
  ...
]

Rules:
- Only include skills that are relevant to the query (score > 0.1).
- Order by score descending.
- Score 1.0 = perfect match, 0.0 = completely irrelevant.
- If no skills are relevant, return an empty array: []`;
}

async function callOpenAI(
  apiKey: string,
  prompt: string,
): Promise<{ activated: ActivatedSkill[]; model: string }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const text = data.choices[0]?.message?.content ?? "[]";
  return { activated: parseActivated(text), model: OPENAI_MODEL };
}

async function callAnthropic(
  apiKey: string,
  prompt: string,
): Promise<{ activated: ActivatedSkill[]; model: string }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const text = data.content.find((b) => b.type === "text")?.text ?? "[]";
  return { activated: parseActivated(text), model: ANTHROPIC_MODEL };
}

function parseActivated(text: string): ActivatedSkill[] {
  // Strip accidental markdown fences
  const clean = text.replace(/```(?:json)?/g, "").trim();
  try {
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is { name: string; score: number; reason: string } =>
          typeof item?.name === "string" &&
          typeof item?.score === "number" &&
          typeof item?.reason === "string",
      )
      .map((item) => ({
        name: item.name,
        score: Math.min(1, Math.max(0, item.score)),
        reason: item.reason,
      }));
  } catch {
    return [];
  }
}

/**
 * Run the LLM-judge activator.
 *
 * @throws Error if no API key is available (caller should fall back to keyword).
 */
export async function llmJudgeActivate(
  query: string,
  skills: SkillManifest[],
): Promise<ActivationResult> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!openaiKey && !anthropicKey) {
    throw new Error(
      "No LLM API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY, or use keyword strategy.",
    );
  }

  const prompt = buildPrompt(query, skills);

  const { activated, model } = openaiKey
    ? await callOpenAI(openaiKey, prompt)
    : await callAnthropic(anthropicKey!, prompt);

  // Filter to skills that actually exist in our registry
  const knownNames = new Set(skills.map((s) => s.frontmatter.name));
  const filtered = activated.filter((a) => knownNames.has(a.name));

  return {
    query,
    activated: filtered,
    strategy: "llm-judge",
    model,
  };
}
