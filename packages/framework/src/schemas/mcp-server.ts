/**
 * McpServerDecl — declaration of an MCP server dependency in SKILL.md.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Shared primitives                                                  */
/* ------------------------------------------------------------------ */

const MCP_SERVER_NAME_REGEX = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

export const McpServerNameSchema = z
  .string()
  .min(1, "MCP server name must not be empty")
  .max(64, "MCP server name too long (max 64 chars)")
  .regex(
    MCP_SERVER_NAME_REGEX,
    "MCP server name must be lowercase a-z, 0-9, with single underscores or hyphens",
  );

export type McpServerName = z.infer<typeof McpServerNameSchema>;

const ENV_VAR_NAME_REGEX = /^[A-Z_][A-Z0-9_]*$/;

export const EnvVarNameSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(ENV_VAR_NAME_REGEX, "env var name must be POSIX-style: uppercase A-Z, 0-9, underscore");

const EnvMapSchema = z.record(EnvVarNameSchema, z.string());
const EnvVarsSchema = z.array(EnvVarNameSchema);

/* ------------------------------------------------------------------ */
/*  Common fields                                                      */
/* ------------------------------------------------------------------ */

const CommonFieldsShape = {
  name: McpServerNameSchema,
  enabled: z.boolean().default(true),
  enabled_tools: z.array(z.string().min(1)).optional(),
  disabled_tools: z.array(z.string().min(1)).optional(),
  startup_timeout_sec: z.number().int().min(1).max(600).optional(),
  tool_timeout_sec: z.number().int().min(1).max(3600).optional(),
  required: z.boolean().default(false),
};

/* ------------------------------------------------------------------ */
/*  stdio variant                                                      */
/* ------------------------------------------------------------------ */

export const StdioMcpServerSchema = z
  .object({
    transport: z.literal("stdio"),
    command: z.string().min(1, "command must not be empty"),
    args: z.array(z.string()).default([]),
    env: EnvMapSchema.default({}),
    env_vars: EnvVarsSchema.default([]),
    cwd: z.string().min(1).optional(),
    experimental_environment: z.enum(["local", "remote"]).optional(),
    ...CommonFieldsShape,
  })
  .passthrough();

export type StdioMcpServer = z.infer<typeof StdioMcpServerSchema>;

/* ------------------------------------------------------------------ */
/*  HTTP variant                                                       */
/* ------------------------------------------------------------------ */

const OAuthAuthSchema = z.object({
  type: z.literal("oauth"),
  resource: z.string().url().optional(),
  scopes: z.array(z.string().min(1)).optional(),
  callback_port: z.number().int().min(1).max(65535).optional(),
  callback_url: z.string().url().optional(),
});

const BearerAuthSchema = z.object({
  type: z.literal("bearer"),
  token_env_var: EnvVarNameSchema,
});

const NoneAuthSchema = z.object({ type: z.literal("none") });

const AuthSchema = z.discriminatedUnion("type", [
  OAuthAuthSchema,
  BearerAuthSchema,
  NoneAuthSchema,
]);

export type Auth = z.infer<typeof AuthSchema>;

const HTTP_HEADER_NAME_REGEX = /^[A-Za-z][A-Za-z0-9-]*$/;
const HttpHeaderNameSchema = z.string().min(1).max(128).regex(HTTP_HEADER_NAME_REGEX);
const HttpHeadersSchema = z.record(HttpHeaderNameSchema, z.string());
const EnvHttpHeadersSchema = z.record(HttpHeaderNameSchema, EnvVarNameSchema);

// NOTE: No .superRefine() here — that would produce ZodEffects which breaks
// z.discriminatedUnion(). Cross-field validation is done at the union level below.
export const HttpMcpServerSchema = z
  .object({
    transport: z.literal("http"),
    url: z.string().url("url must be a valid HTTP/HTTPS URL"),
    auth: AuthSchema.optional(),
    http_headers: HttpHeadersSchema.optional(),
    env_http_headers: EnvHttpHeadersSchema.optional(),
    bearer_token_env_var: EnvVarNameSchema.optional(),
    ...CommonFieldsShape,
  })
  .passthrough();

export type HttpMcpServer = z.infer<typeof HttpMcpServerSchema>;

/* ------------------------------------------------------------------ */
/*  Union — discriminated by transport                                 */
/* ------------------------------------------------------------------ */

/**
 * We use z.union() instead of z.discriminatedUnion() because superRefine
 * wraps schemas in ZodEffects, which discriminatedUnion cannot accept.
 * z.union() provides the same runtime behavior for two variants with a
 * literal discriminant field.
 */
export const McpServerDeclSchema = z
  .union([StdioMcpServerSchema, HttpMcpServerSchema])
  .superRefine((decl, ctx) => {
    // Cross-field validation for HTTP variant
    if (
      decl.transport === "http" &&
      decl.bearer_token_env_var &&
      decl.auth?.type === "oauth"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["auth"],
        message:
          "cannot use `bearer_token_env_var` together with `auth.type: oauth` — pick one",
      });
    }
  });

export type McpServerDecl = z.infer<typeof McpServerDeclSchema>;

/* ------------------------------------------------------------------ */
/*  mcp_servers array                                                  */
/* ------------------------------------------------------------------ */

export const McpServerListSchema = z
  .array(McpServerDeclSchema)
  .default([])
  .superRefine((servers, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < servers.length; i++) {
      const name = servers[i].name;
      if (seen.has(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, "name"],
          message: `duplicate MCP server name: "${name}"`,
        });
      }
      seen.add(name);
    }
  });

export type McpServerList = z.infer<typeof McpServerListSchema>;
