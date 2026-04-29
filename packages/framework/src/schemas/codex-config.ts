/**
 * codex-config.ts — partial schema for the parts of Codex's config.toml
 * that the framework reads and writes.
 *
 * Codex's full config.toml is not validated here — only the
 * `[mcp_servers.<name>]` tables we touch. Unknown top-level keys are
 * preserved verbatim when we read-modify-write the file.
 */

import { z } from "zod";

/**
 * One `[mcp_servers.<name>]` table as it appears in config.toml.
 * This is what Codex reads at startup.
 */
export const CodexMcpEntrySchema = z.object({
  type: z.enum(["stdio", "http"]).optional(),

  // stdio fields
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
  experimental_environment: z.enum(["local", "remote"]).optional(),

  // http fields
  url: z.string().optional(),
  auth: z.record(z.string(), z.unknown()).optional(),
  bearer_token_env_var: z.string().optional(),
  http_headers: z.record(z.string(), z.string()).optional(),
  env_http_headers: z.record(z.string(), z.string()).optional(),

  // common optional fields
  enabled: z.boolean().optional(),
  enabled_tools: z.array(z.string()).optional(),
  disabled_tools: z.array(z.string()).optional(),
  startup_timeout_sec: z.number().int().optional(),
  tool_timeout_sec: z.number().int().optional(),
  required: z.boolean().optional(),
}).passthrough();

export type CodexMcpEntry = z.infer<typeof CodexMcpEntrySchema>;

/**
 * The mcp_servers section of config.toml.
 * Record<serverName, entry>
 */
export const CodexMcpSectionSchema = z.record(z.string(), CodexMcpEntrySchema);

export type CodexMcpSection = z.infer<typeof CodexMcpSectionSchema>;
