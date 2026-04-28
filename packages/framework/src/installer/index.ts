/**
 * installer/index.ts — orchestrates skill install and uninstall.
 */

import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";
import { resolveInstallPaths, type InstallScope } from "./paths.js";
import { mergeMcpServers, removeMcpServers } from "./config-toml.js";
import { sanitizeFrontmatter } from "../schemas/frontmatter.js";
import type { SkillManifest } from "../schemas/manifest.js";

export interface InstallResult {
  skillName: string;
  scope: InstallScope;
  skillDestDir: string;
  configTomlPath: string;
  mcpServersAdded: string[];
}

export interface UninstallResult {
  skillName: string;
  scope: InstallScope;
  skillDestDir: string;
  configTomlPath: string;
  mcpServersRemoved: string[];
  wasInstalled: boolean;
}

export function installSkill(
  manifest: SkillManifest,
  scope: InstallScope,
  cwd?: string,
): InstallResult {
  const name = manifest.frontmatter.name;
  const paths = resolveInstallPaths(name, scope, cwd);

  copySkillFolder(manifest.skillDir, paths.skillDestDir, manifest);
  writeFrameworkMeta(paths.skillDestDir, manifest);

  const servers = manifest.frontmatter.mcp_servers ?? [];
  const mcpServersAdded = mergeMcpServers(paths.configTomlPath, servers);

  return {
    skillName: name,
    scope,
    skillDestDir: paths.skillDestDir,
    configTomlPath: paths.configTomlPath,
    mcpServersAdded,
  };
}

export function uninstallSkill(
  skillName: string,
  scope: InstallScope,
  mcpServerNames: string[],
  cwd?: string,
): UninstallResult {
  const paths = resolveInstallPaths(skillName, scope, cwd);
  const wasInstalled = fs.existsSync(paths.skillDestDir);

  if (wasInstalled) {
    fs.rmSync(paths.skillDestDir, { recursive: true, force: true });
  }

  const mcpServersRemoved = removeMcpServers(paths.configTomlPath, mcpServerNames);

  return {
    skillName,
    scope,
    skillDestDir: paths.skillDestDir,
    configTomlPath: paths.configTomlPath,
    mcpServersRemoved,
    wasInstalled,
  };
}

function copySkillFolder(
  srcDir: string,
  destDir: string,
  manifest: SkillManifest,
): void {
  fs.mkdirSync(destDir, { recursive: true });
  copyRecursive(srcDir, destDir, ["SKILL.md"]);

  // Write sanitized SKILL.md (framework extension keys stripped)
  const sanitized = sanitizeFrontmatter(manifest.frontmatter);
  const original = fs.readFileSync(manifest.skillMdPath, "utf-8");
  const parsed = matter(original);
  const rewritten =
    `---\n${serializeYaml(sanitized as Record<string, unknown>)}---\n\n${parsed.content.trim()}\n`;
  fs.writeFileSync(path.join(destDir, "SKILL.md"), rewritten, "utf-8");
}

function copyRecursive(src: string, dest: string, exclude: string[] = []): void {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (exclude.includes(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function writeFrameworkMeta(destDir: string, manifest: SkillManifest): void {
  const meta = {
    mcp_servers: manifest.frontmatter.mcp_servers ?? [],
    scripts: manifest.frontmatter.scripts ?? [],
  };
  fs.writeFileSync(
    path.join(destDir, "_framework.json"),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );
}

/** Minimal YAML serializer — only handles the flat scalar types we write. */
function serializeYaml(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      if (typeof v === "string") {
        // Multi-line → block scalar
        if (v.includes("\n")) return `${k}: |\n  ${v.replace(/\n/g, "\n  ")}`;
        // Strings needing quoting
        if (/[:#{}\[\],&*?|<>=!%@`]/.test(v) || v.trim() !== v)
          return `${k}: ${JSON.stringify(v)}`;
        return `${k}: ${v}`;
      }
      if (typeof v === "boolean" || typeof v === "number") return `${k}: ${v}`;
      // Arrays / objects — fall back to JSON-compatible inline
      return `${k}: ${JSON.stringify(v)}`;
    })
    .join("\n") + "\n";
}
