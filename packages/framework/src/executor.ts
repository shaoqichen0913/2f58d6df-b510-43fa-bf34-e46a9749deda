/**
 * executor.ts — run a bundled skill script.
 *
 * Resolves the script path from the installed skill folder, spawns
 * it as a child process, streams output, enforces timeout, and
 * returns a structured result.
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import type { SkillManifest } from "./schemas/manifest.js";

export interface ExecuteResult {
  scriptName: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export class ExecuteError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ExecuteError";
  }
}

/**
 * Execute a named script from a skill manifest.
 *
 * @param manifest   - Parsed skill manifest (must have resolvedScripts populated)
 * @param scriptName - Name of the script to run (from frontmatter `scripts[].name`)
 * @param args       - Additional CLI args to pass to the script
 * @param env        - Additional environment variables
 */
export function executeScript(
  manifest: SkillManifest,
  scriptName: string,
  args: string[] = [],
  env: Record<string, string> = {},
): ExecuteResult {
  // ── 1. Find the script ─────────────────────────────────────────────
  const decl = manifest.frontmatter.scripts?.find((s) => s.name === scriptName);
  if (!decl) {
    throw new ExecuteError(
      `Script "${scriptName}" not declared in skill "${manifest.frontmatter.name}". ` +
        `Available: ${(manifest.frontmatter.scripts ?? []).map((s) => s.name).join(", ") || "(none)"}`,
    );
  }

  const resolved = manifest.resolvedScripts.find((s) => s.name === scriptName);
  if (!resolved) {
    throw new ExecuteError(
      `Script "${scriptName}" is declared but the file was not found on disk: ${decl.path}`,
    );
  }

  // ── 2. Make executable ─────────────────────────────────────────────
  try {
    fs.chmodSync(resolved.absolutePath, 0o755);
  } catch {
    // Best-effort; if chmod fails, the spawn will tell us more
  }

  // ── 3. Spawn ───────────────────────────────────────────────────────
  const timeoutMs = (decl.timeout_sec ?? 30) * 1000;
  const start = Date.now();

  const result = spawnSync(resolved.absolutePath, args, {
    encoding: "utf-8",
    timeout: timeoutMs,
    env: { ...process.env, ...env },
    cwd: manifest.skillDir,
  });

  const durationMs = Date.now() - start;
  const timedOut = result.signal === "SIGTERM" || result.error?.message?.includes("ETIMEDOUT") === true;

  return {
    scriptName,
    exitCode: result.status ?? (timedOut ? 124 : 1),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    timedOut,
    durationMs,
  };
}
