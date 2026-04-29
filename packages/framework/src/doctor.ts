/**
 * doctor.ts — runtime readiness checks for an installed skill.
 */

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import type { SkillManifest } from "./schemas/manifest.js";
import type { McpServerDecl } from "./schemas/mcp-server.js";
import type { ScriptDecl } from "./schemas/script.js";

export type CheckStatus = "ok" | "warn" | "error";

export interface DoctorCheck {
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface DoctorResult {
  skillName: string;
  checks: DoctorCheck[];
  allPassed: boolean;
}

interface FrameworkMeta {
  mcp_servers: McpServerDecl[];
  scripts: ScriptDecl[];
}

function readFrameworkMeta(skillDir: string): FrameworkMeta {
  const metaPath = path.join(skillDir, "_framework.json");
  if (!fs.existsSync(metaPath)) {
    return {
      mcp_servers: [],
      scripts: [],
    };
  }
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as FrameworkMeta;
  } catch {
    return { mcp_servers: [], scripts: [] };
  }
}

export async function runDoctor(
  manifest: SkillManifest,
  opts: { pingUrls?: boolean } = {},
): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const meta = readFrameworkMeta(manifest.skillDir);

  for (const server of meta.mcp_servers) {
    const serverChecks =
      server.transport === "http"
        ? await checkHttpServer(server, opts.pingUrls ?? false)
        : checkStdioServer(server);
    checks.push(...serverChecks);
  }

  for (const script of meta.scripts) {
    const absolutePath = path.join(manifest.skillDir, script.path);
    checks.push(checkScript(absolutePath, script.name));
  }

  return {
    skillName: manifest.frontmatter.name,
    checks,
    allPassed: checks.every((c) => c.status !== "error"),
  };
}

// ── HTTP MCP server ───────────────────────────────────────────────────────

async function checkHttpServer(
  server: McpServerDecl & { transport: "http" },
  pingUrl: boolean,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  if (server.auth?.type === "oauth") {
    checks.push({
      label: `${server.name}: auth`,
      status: "ok",
      detail: "OAuth — run `codex mcp login` once to authenticate",
    });
  } else {
    const tokenEnvVar =
      server.auth?.type === "bearer"
        ? (server.auth as { type: "bearer"; token_env_var: string }).token_env_var
        : server.bearer_token_env_var;

    if (tokenEnvVar) {
      const set = Boolean(process.env[tokenEnvVar]);
      checks.push({
        label: `${server.name}: env ${tokenEnvVar}`,
        status: set ? "ok" : "error",
        detail: set ? "set" : `not set — export ${tokenEnvVar}=<token>`,
      });
    }
  }

  if (pingUrl) {
    checks.push(await reachabilityCheck(server.name, server.url));
  } else {
    checks.push({
      label: `${server.name}: url`,
      status: "ok",
      detail: server.url,
    });
  }

  return checks;
}

async function reachabilityCheck(serverName: string, url: string): Promise<DoctorCheck> {
  const label = `${serverName}: MCP handshake`;
  const initRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "skill-framework-doctor", version: "1.0.0" },
    },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(initRequest),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return {
        label,
        status: "error",
        detail: `invalid MCP response — expected application/json, got "${contentType || "missing"}"`,
      };
    }

    const body = await res.json() as Record<string, unknown>;
    if (body.jsonrpc !== "2.0" || !body.result) {
      return {
        label,
        status: "warn",
        detail: `unexpected JSON-RPC response: ${JSON.stringify(body).slice(0, 80)}`,
      };
    }

    return { label, status: "ok", detail: `MCP handshake succeeded (${url})` };
  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError" ? "timed out after 5s" : String(err);
    return { label, status: "error", detail: `handshake failed — ${msg}` };
  }
}

// ── stdio MCP server ──────────────────────────────────────────────────────

function checkStdioServer(
  server: McpServerDecl & { transport: "stdio" },
): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  const found = commandInPath(server.command);
  checks.push({
    label: `${server.name}: command ${server.command}`,
    status: found ? "ok" : "error",
    detail: found ? `found at ${found}` : `not found in PATH — install it first`,
  });

  for (const envVar of server.env_vars ?? []) {
    const set = Boolean(process.env[envVar]);
    checks.push({
      label: `${server.name}: env ${envVar}`,
      status: set ? "ok" : "error",
      detail: set ? "set" : `not set — export ${envVar}=<value>`,
    });
  }

  return checks;
}

// ── Script ────────────────────────────────────────────────────────────────

function checkScript(absolutePath: string, name: string): DoctorCheck {
  try {
    fs.accessSync(absolutePath, fs.constants.X_OK);
    return { label: `script: ${name}`, status: "ok", detail: "executable" };
  } catch {
    return {
      label: `script: ${name}`,
      status: "error",
      detail: `not executable — run: chmod +x ${path.relative(process.cwd(), absolutePath)}`,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function commandInPath(cmd: string): string | null {
  const result = spawnSync("which", [cmd], { encoding: "utf-8" });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}
