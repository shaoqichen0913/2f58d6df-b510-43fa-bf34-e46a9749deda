// src/commands/install.ts
import chalk from "chalk";
import ora from "ora";
import { Command } from "commander";
import {
  parseSkill,
  installSkill,
  fetchIndex,
  downloadSkill,
  ParseError,
  RegistryError,
  type InstallScope,
} from "@shaoqichen0913/skill-framework";

const DEFAULT_REGISTRY =
  process.env.SKILL_REGISTRY_URL ??
  "https://raw.githubusercontent.com/shaoqichen0913/e8c7cc37-982a-4359-be55-2fd466344bc9/main";

/** Returns true if the argument looks like a local path rather than a skill name. */
function isLocalPath(arg: string): boolean {
  return arg.startsWith(".") || arg.startsWith("/") || arg.startsWith("~") || arg.includes("/");
}

export function registerInstall(program: Command): void {
  program
    .command("install <nameOrPath>")
    .description(
      "Install a skill by name from the registry, or from a local path\n" +
      "  skills install code-reviewer --scope project\n" +
      "  skills install ./my-skill --scope user"
    )
    .option("--scope <scope>", "Install scope: user | project", "project")
    .option("--registry <url>", "Registry base URL", DEFAULT_REGISTRY)
    .action(async (nameOrPath: string, opts: { scope: string; registry: string }) => {
      const scope = opts.scope as InstallScope;
      if (scope !== "user" && scope !== "project") {
        console.error(chalk.red(`Invalid scope "${scope}". Use: user | project`));
        process.exit(1);
      }

      let skillPath: string;

      if (isLocalPath(nameOrPath)) {
        skillPath = nameOrPath;
      } else {
        // Treat as a skill name — fetch from registry
        const fetchSpinner = ora(`Fetching "${nameOrPath}" from registry...`).start();
        try {
          const index = await fetchIndex(opts.registry);
          skillPath = await downloadSkill(nameOrPath, index);
          fetchSpinner.succeed(`Downloaded "${nameOrPath}"`);
        } catch (err) {
          fetchSpinner.fail(
            err instanceof RegistryError ? err.message : `Registry error: ${String(err)}`
          );
          process.exit(1);
        }
      }

      const parseSpinner = ora(`Parsing skill...`).start();
      let manifest;
      try {
        manifest = parseSkill(skillPath);
        parseSpinner.succeed(`Parsed: ${manifest.frontmatter.name}`);
      } catch (err) {
        parseSpinner.fail(
          err instanceof ParseError ? err.message : `Parse error: ${String(err)}`
        );
        process.exit(1);
      }

      const installSpinner = ora(`Installing to ${scope} scope...`).start();
      try {
        const result = installSkill(manifest, scope);
        installSpinner.succeed(
          chalk.green(`✓ Installed ${chalk.bold(manifest.frontmatter.name)}`)
        );

        console.log(`\n  Skill dir   : ${chalk.cyan(result.skillDestDir)}`);
        console.log(`  Config TOML : ${chalk.cyan(result.configTomlPath)}`);

        if (result.mcpServersAdded.length > 0) {
          console.log(
            `  MCP servers : ${chalk.yellow(result.mcpServersAdded.join(", "))} → merged into config.toml`
          );
        } else {
          console.log(`  MCP servers : (none declared)`);
        }

        if (manifest.warnings.length > 0) {
          console.log();
          for (const w of manifest.warnings) {
            console.log(chalk.yellow(`  ⚠ ${w}`));
          }
        }
        console.log();
      } catch (err) {
        installSpinner.fail(chalk.red(`Install failed: ${String(err)}`));
        process.exit(1);
      }
    });
}
