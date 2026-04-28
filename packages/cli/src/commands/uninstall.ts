// src/commands/uninstall.ts
import chalk from "chalk";
import { Command } from "commander";
import { parseSkill, uninstallSkill, type InstallScope } from "@shaoqichen0913/skill-framework";
import * as path from "path";
import * as os from "os";

export function registerUninstall(program: Command): void {
  program
    .command("uninstall <skillName>")
    .description("Remove an installed skill and clean up its config.toml entries")
    .option("--scope <scope>", "Scope to remove from: user | project", "project")
    .option("--skill-path <path>", "Original skill path (to read MCP server names)")
    .action((skillName: string, opts: { scope: string; skillPath?: string }) => {
      const scope = opts.scope as InstallScope;

      // Resolve MCP server names to remove from config.toml
      let mcpServerNames: string[] = [];
      if (opts.skillPath) {
        try {
          const manifest = parseSkill(opts.skillPath);
          mcpServerNames = (manifest.frontmatter.mcp_servers ?? []).map((s) => s.name);
        } catch {
          // Non-fatal: we'll still remove the skill folder
        }
      } else {
        // Try installed location
        const base = scope === "user"
          ? path.join(os.homedir(), ".codex")
          : path.join(process.cwd(), ".codex");
        const installedPath = path.join(base, "skills", skillName);
        try {
          const manifest = parseSkill(installedPath);
          mcpServerNames = (manifest.frontmatter.mcp_servers ?? []).map((s) => s.name);
        } catch {
          // Can't read MCP names — folder might already be gone
        }
      }

      const result = uninstallSkill(skillName, scope, mcpServerNames);

      if (!result.wasInstalled) {
        console.log(chalk.yellow(`"${skillName}" was not installed in ${scope} scope.`));
        return;
      }

      console.log(chalk.green(`✓ Removed ${chalk.bold(skillName)} from ${scope} scope`));
      if (result.mcpServersRemoved.length > 0) {
        console.log(`  MCP servers removed from config.toml: ${result.mcpServersRemoved.join(", ")}`);
      }
    });
}
