// src/commands/run.ts
import * as path from "path";
import * as os from "os";
import chalk from "chalk";
import { Command } from "commander";
import { parseSkill, executeScript, ExecuteError } from "@shaoqichen0913/skill-framework";

export function registerRun(program: Command): void {
  program
    .command("run <skillName> <scriptName> [args...]")
    .description(
      "Execute a bundled script from an installed skill\n" +
      "  skills run code-reviewer lint --file src/index.ts\n" +
      "  skills run knowledge-retriever fetch-context"
    )
    .option("--scope <scope>", "Look in user | project scope", "project")
    .option("--skill-path <path>", "Override: run from a specific skill folder path")
    .action(
      (
        skillName: string,
        scriptName: string,
        extraArgs: string[],
        opts: { scope: string; skillPath?: string }
      ) => {
        // Resolve skill folder
        let skillDir: string;
        if (opts.skillPath) {
          skillDir = opts.skillPath;
        } else {
          const base =
            opts.scope === "user"
              ? path.join(os.homedir(), ".codex")
              : path.join(process.cwd(), ".codex");
          skillDir = path.join(base, "skills", skillName);
        }

        let manifest;
        try {
          manifest = parseSkill(skillDir);
        } catch (err) {
          console.error(chalk.red(`Cannot read skill "${skillName}": ${String(err)}`));
          process.exit(1);
        }

        let result;
        try {
          result = executeScript(manifest, scriptName, extraArgs);
        } catch (err) {
          if (err instanceof ExecuteError) {
            console.error(chalk.red(err.message));
          } else {
            console.error(chalk.red(`Unexpected error: ${String(err)}`));
          }
          process.exit(1);
        }

        // Print output
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);

        if (result.timedOut) {
          console.error(chalk.red(`\n✗ Script timed out after ${result.durationMs}ms`));
          process.exit(124);
        }

        if (result.exitCode !== 0) {
          console.error(chalk.red(`\n✗ Script exited with code ${result.exitCode}`));
          process.exit(result.exitCode);
        }

        console.error(chalk.gray(`\n✓ Completed in ${result.durationMs}ms`));
      }
    );
}
