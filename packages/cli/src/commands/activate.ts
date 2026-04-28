// src/commands/activate.ts
import * as path from "path";
import * as os from "os";
import chalk from "chalk";
import ora from "ora";
import { Command } from "commander";
import { discoverSkills, activate, type ActivationStrategy } from "@shaoqichen0913/skill-framework";

export function registerActivate(program: Command): void {
  program
    .command("activate <query>")
    .description(
      'Demonstrate skill activation for a given query (mirrors how Codex picks skills)\n' +
      '  skills activate "Find me everything about RAG architectures"\n' +
      '  skills activate "review my code" --strategy keyword'
    )
    .option("--strategy <s>", "auto | llm-judge | keyword (default: auto)", "auto")
    .option("--project-dir <dir>", "Project root directory", process.cwd())
    .action(async (query: string, opts: { strategy: string; projectDir: string }) => {
      const roots = [
        path.join(opts.projectDir, ".codex", "skills"),
        path.join(os.homedir(), ".codex", "skills"),
      ];

      const { skills, diagnostics } = discoverSkills(roots);

      if (diagnostics.length > 0) {
        for (const d of diagnostics) {
          console.warn(chalk.yellow(`⚠ Skipped (parse error): ${d.skillDir}`));
        }
      }

      if (skills.length === 0) {
        console.log(chalk.gray("No skills found. Install some first with: skills install <path>"));
        return;
      }

      const strategy = opts.strategy as ActivationStrategy;
      const spinner = ora(
        `Activating (${strategy === "auto"
          ? (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) ? "llm-judge" : "keyword"
          : strategy})...`
      ).start();

      let result;
      try {
        result = await activate(query, skills, strategy);
        spinner.stop();
      } catch (err) {
        spinner.fail(chalk.red(String(err)));
        process.exit(1);
      }

      console.log(chalk.bold(`\n🔍 Query: "${query}"`));
      console.log(chalk.gray(`   Strategy: ${result.strategy}${result.model ? ` (${result.model})` : ""}\n`));

      if (result.activated.length === 0) {
        console.log(chalk.gray("  No skills matched this query.\n"));
        return;
      }

      for (const activated of result.activated) {
        const bar = "█".repeat(Math.round(activated.score * 10)).padEnd(10, "░");
        console.log(
          `  ${chalk.cyan(activated.name.padEnd(30))} ` +
          `${chalk.green(bar)} ${(activated.score * 100).toFixed(0)}%`
        );
        console.log(`  ${" ".repeat(30)} ${chalk.gray(activated.reason)}\n`);
      }
    });
}
