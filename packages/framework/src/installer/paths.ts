/**
 * paths.ts — resolve install scope to filesystem paths.
 *
 * Two scopes:
 *   user    → ~/.codex/skills/<skill-name>/   (shared across projects)
 *   project → <cwd>/.codex/skills/<skill-name>/  (local to one repo)
 */

import * as os from "os";
import * as path from "path";

export type InstallScope = "user" | "project";

export interface InstallPaths {
  /** Where the skill folder will be written. */
  skillDestDir: string;
  /** The root skills directory (parent of skillDestDir). */
  skillsRootDir: string;
  /** Where Codex's config.toml lives for this scope. */
  configTomlPath: string;
}

export function resolveInstallPaths(
  skillName: string,
  scope: InstallScope,
  cwd: string = process.cwd(),
): InstallPaths {
  const base =
    scope === "user"
      ? path.join(os.homedir(), ".codex")
      : path.join(cwd, ".codex");

  const skillsRootDir = path.join(base, "skills");
  const skillDestDir = path.join(skillsRootDir, skillName);
  const configTomlPath = path.join(base, "config.toml");

  return { skillDestDir, skillsRootDir, configTomlPath };
}
