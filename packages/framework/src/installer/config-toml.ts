/**
 * config-toml.ts — read, merge, and write Codex's config.toml.
 *
 * The merge is idempotent: running install twice produces the same file.
 * Unrelated config entries (model settings, safety, etc.) are preserved.
 *
 * We use @iarna/toml which round-trips TOML faithfully.
 */

import * as fs from "fs";
import * as path from "path";
import TOML from "@iarna/toml";
import type { McpServerDecl } from "../schemas/mcp-server.js";

type TomlDocument = TOML.JsonMap;

export class ConfigTomlError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ConfigTomlError";
  }
}

function readToml(filePath: string): TomlDocument {
  if (!fs.existsSync(filePath)) return {};
  try {
    return TOML.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    throw new ConfigTomlError(
      `Failed to parse config.toml at ${filePath}. Fix the TOML syntax before installing or uninstalling skills.`,
      filePath,
      err,
    );
  }
}

export function assertConfigTomlReadable(filePath: string): void {
  readToml(filePath);
}

function writeToml(filePath: string, doc: TomlDocument): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, TOML.stringify(doc), "utf-8");
}

/**
 * Translate a McpServerDecl to the flat structure Codex expects in
 * config.toml's [mcp_servers.<name>] table.
 */
function declToTomlEntry(decl: McpServerDecl): Record<string, unknown> {
  if (decl.transport === "stdio") {
    const entry: Record<string, unknown> = {
      command: decl.command,
      args: decl.args ?? [],
    };
    if (decl.env && Object.keys(decl.env).length > 0) entry.env = decl.env;
    if (decl.cwd) entry.cwd = decl.cwd;
    if (decl.experimental_environment) entry.experimental_environment = decl.experimental_environment;
    if (decl.enabled === false) entry.enabled = false;
    if (decl.enabled_tools) entry.enabled_tools = decl.enabled_tools;
    if (decl.disabled_tools) entry.disabled_tools = decl.disabled_tools;
    if (decl.startup_timeout_sec) entry.startup_timeout_sec = decl.startup_timeout_sec;
    if (decl.tool_timeout_sec) entry.tool_timeout_sec = decl.tool_timeout_sec;
    if (decl.required) entry.required = true;
    return entry;
  } else {
    const entry: Record<string, unknown> = {
      url: decl.url,
    };
    if (decl.auth) entry.auth = decl.auth;
    if (decl.http_headers) entry.http_headers = decl.http_headers;
    if (decl.env_http_headers) entry.env_http_headers = decl.env_http_headers;
    if (decl.bearer_token_env_var) entry.bearer_token_env_var = decl.bearer_token_env_var;
    if (decl.enabled === false) entry.enabled = false;
    if (decl.enabled_tools) entry.enabled_tools = decl.enabled_tools;
    if (decl.disabled_tools) entry.disabled_tools = decl.disabled_tools;
    if (decl.startup_timeout_sec) entry.startup_timeout_sec = decl.startup_timeout_sec;
    if (decl.tool_timeout_sec) entry.tool_timeout_sec = decl.tool_timeout_sec;
    if (decl.required) entry.required = true;
    return entry;
  }
}

/**
 * Merge a skill's MCP server declarations into config.toml.
 * Existing entries with the same name are overwritten (idempotent).
 *
 * @returns Names of servers that were added or updated.
 */
export function mergeMcpServers(
  configTomlPath: string,
  servers: McpServerDecl[],
): string[] {
  if (servers.length === 0) return [];

  const doc = readToml(configTomlPath);

  // Ensure mcp_servers table exists
  if (!doc.mcp_servers || typeof doc.mcp_servers !== "object") {
    doc.mcp_servers = {};
  }
  const section = doc.mcp_servers as Record<string, unknown>;

  const updated: string[] = [];
  for (const decl of servers) {
    section[decl.name] = declToTomlEntry(decl);
    updated.push(decl.name);
  }

  writeToml(configTomlPath, doc);
  return updated;
}

/**
 * Remove a skill's MCP servers from config.toml.
 * Servers not present in the file are ignored.
 *
 * @returns Names of servers that were removed.
 */
export function removeMcpServers(
  configTomlPath: string,
  serverNames: string[],
): string[] {
  if (serverNames.length === 0 || !fs.existsSync(configTomlPath)) return [];

  const doc = readToml(configTomlPath);
  if (!doc.mcp_servers || typeof doc.mcp_servers !== "object") return [];

  const section = doc.mcp_servers as Record<string, unknown>;
  const removed: string[] = [];
  for (const name of serverNames) {
    if (name in section) {
      delete section[name];
      removed.push(name);
    }
  }

  writeToml(configTomlPath, doc);
  return removed;
}
