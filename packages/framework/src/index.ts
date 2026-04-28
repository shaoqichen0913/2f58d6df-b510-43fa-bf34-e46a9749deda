/**
 * index.ts — public API of @skill-framework/framework
 *
 * Re-exports everything a CLI or external consumer needs.
 */

// Schemas
export * from "./schemas/frontmatter.js";
export * from "./schemas/mcp-server.js";
export * from "./schemas/script.js";
export * from "./schemas/manifest.js";
export * from "./schemas/activation.js";
export * from "./schemas/codex-config.js";

// Core operations
export { parseSkill, ParseError } from "./parser.js";
export { discoverSkills } from "./discovery.js";
export type { DiscoveryResult, DiscoveryDiagnostic } from "./discovery.js";

// Installer
export { installSkill, uninstallSkill } from "./installer/index.js";
export type { InstallResult, UninstallResult } from "./installer/index.js";
export { resolveInstallPaths } from "./installer/paths.js";
export type { InstallScope, InstallPaths } from "./installer/paths.js";

// Activator
export { activate } from "./activator/index.js";
export type { ActivationStrategy } from "./activator/index.js";

// Executor
export { executeScript, ExecuteError } from "./executor.js";
export type { ExecuteResult } from "./executor.js";

// Registry
export { fetchIndex, searchIndex, downloadSkill, RegistryError } from "./registry.js";
export type { RegistryEntry, RegistryIndex } from "./registry.js";

// Doctor
export { runDoctor } from "./doctor.js";
export type { DoctorCheck, DoctorResult, CheckStatus } from "./doctor.js";
