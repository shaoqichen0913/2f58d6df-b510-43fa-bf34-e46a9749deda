// src/commands/search.ts
import chalk from "chalk";
import ora from "ora";
import { Command } from "commander";
import { fetchIndex, searchIndex } from "@shaoqichen0913/skill-framework";

const DEFAULT_REGISTRY =
  process.env.SKILL_REGISTRY_URL ??
  "https://raw.githubusercontent.com/shaoqichen0913/e8c7cc37-982a-4359-be55-2fd466344bc9/main";

export function registerSearch(program: Command): void {
  program
    .command("search [query]")
    .description(
      "Search available skills in the registry\n" +
      '  skills search\n' +
      '  skills search "code review"\n' +
      '  skills search retrieval --registry <url>'
    )
    .option("--registry <url>", "Registry base URL", DEFAULT_REGISTRY)
    .action(async (query: string | undefined, opts: { registry: string }) => {
      const spinner = ora("Fetching registry...").start();

      let index;
      try {
        index = await fetchIndex(opts.registry);
        spinner.stop();
      } catch (err) {
        spinner.fail(chalk.red(String(err)));
        process.exit(1);
      }

      const results = searchIndex(index, query ?? "");

      if (results.length === 0) {
        console.log(chalk.gray(`\nNo skills found${query ? ` for "${query}"` : ""}.\n`));
        return;
      }

      console.log(chalk.bold(`\n🔍 Available skills (${results.length})\n`));
      for (const entry of results) {
        console.log(`  ${chalk.cyan(entry.name.padEnd(30))} ${entry.description}`);
      }
      console.log();
      console.log(chalk.gray(`  Install with: skills install <name> --scope project`));
      console.log();
    });
}
