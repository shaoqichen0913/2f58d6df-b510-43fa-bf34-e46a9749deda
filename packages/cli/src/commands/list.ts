// src/commands/list.ts
import * as path from "path";
import * as os from "os";
import chalk from "chalk";
import { Command } from "commander";
import { discoverSkills, toSummary } from "@shaoqichen0913/skill-framework";

export function registerList(program: Command): void {
  program
    .command("list")
    .alias("ls")
    .description("List all discovered skills across project and user scopes")
    .option("--project-dir <dir>", "Project root directory", process.cwd())
    .action((opts: { projectDir: string }) => {
      const roots = [
        path.join(opts.projectDir, ".codex", "skills"),
        path.join(os.homedir(), ".codex", "skills"),
      ];

      const { skills, diagnostics, conflicts } = discoverSkills(roots);

      if (skills.length === 0 && diagnostics.length === 0) {
        console.log(chalk.gray("No skills found. Install one with: skills install <path> --scope project"));
        return;
      }

      if (skills.length > 0) {
        console.log(chalk.bold(`\n📦 Skills (${skills.length})\n`));
        for (const manifest of skills) {
          const s = toSummary(manifest);
          console.log(`  ${chalk.cyan(s.name.padEnd(30))} ${chalk.gray(s.skillDir)}`);
          console.log(`  ${" ".repeat(30)} ${s.description.slice(0, 72)}`);
          if (s.mcpServerCount > 0) {
            console.log(`  ${" ".repeat(30)} ${chalk.yellow(`${s.mcpServerCount} MCP server(s)`)}`);
          }
          if (s.scriptCount > 0) {
            console.log(`  ${" ".repeat(30)} ${chalk.magenta(`${s.scriptCount} script(s)`)}`);
          }
          if (s.warnings.length > 0) {
            for (const w of s.warnings) {
              console.log(`  ${" ".repeat(30)} ${chalk.yellow("⚠")} ${w}`);
            }
          }
          console.log();
        }
      }

      if (diagnostics.length > 0) {
        console.log(chalk.bold(chalk.red(`\n✗ Failed to parse (${diagnostics.length})\n`)));
        for (const d of diagnostics) {
          console.log(`  ${chalk.red(d.skillDir)}`);
          console.log(`    ${d.error}\n`);
        }
      }

      if (conflicts.length > 0) {
        console.log(chalk.bold(chalk.yellow(`\n⚠ Name conflicts (${conflicts.length})\n`)));
        for (const c of conflicts) {
          console.log(`  "${c.name}": kept ${c.kept}, skipped ${c.skipped}`);
        }
      }
    });
}
