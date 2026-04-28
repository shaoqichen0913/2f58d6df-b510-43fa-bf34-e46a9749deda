// src/commands/doctor.ts
import * as path from "path";
import * as os from "os";
import chalk from "chalk";
import { Command } from "commander";
import { discoverSkills, runDoctor, type CheckStatus, type DoctorCheck } from "@shaoqichen0913/skill-framework";

const STATUS_ICON: Record<CheckStatus, string> = {
  ok: chalk.green("✓"),
  warn: chalk.yellow("⚠"),
  error: chalk.red("✗"),
};

export function registerDoctor(program: Command): void {
  program
    .command("doctor <skillName>")
    .description(
      "Check runtime readiness of an installed skill\n" +
      "  skills doctor code-reviewer\n" +
      "  skills doctor knowledge-retriever --ping"
    )
    .option("--ping", "Ping MCP server URLs to verify reachability", false)
    .option("--project-dir <dir>", "Project root directory", process.cwd())
    .action(async (skillName: string, opts: { ping: boolean; projectDir: string }) => {
      const roots = [
        path.join(opts.projectDir, ".codex", "skills"),
        path.join(os.homedir(), ".codex", "skills"),
      ];

      const { skills } = discoverSkills(roots);
      const manifest = skills.find((s) => s.frontmatter.name === skillName);

      if (!manifest) {
        console.error(chalk.red(`\n✗ Skill "${skillName}" is not installed.`));
        console.error(chalk.gray(`  Install it first: skills install ${skillName}\n`));
        process.exit(1);
      }

      console.log(chalk.bold(`\n🩺 Doctor: ${skillName}\n`));

      const result = await runDoctor(manifest, { pingUrls: opts.ping });

      if (result.checks.length === 0) {
        console.log(chalk.gray("  No runtime dependencies declared.\n"));
        return;
      }

      for (const check of result.checks) {
        const icon = STATUS_ICON[check.status];
        console.log(`  ${icon} ${chalk.bold(check.label)}`);
        console.log(`     ${chalk.gray(check.detail)}`);
      }

      console.log();

      if (result.allPassed) {
        console.log(chalk.green("  All checks passed — skill is ready to use.\n"));
      } else {
        const errors = result.checks.filter((c: DoctorCheck) => c.status === "error").length;
        console.log(chalk.red(`  ${errors} check(s) failed — skill may not work correctly.\n`));
        process.exit(1);
      }
    });
}
