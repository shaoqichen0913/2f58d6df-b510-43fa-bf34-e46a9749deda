// src/commands/validate.ts
import chalk from "chalk";
import { Command } from "commander";
import { parseSkill, ParseError } from "@shaoqichen0913/skill-framework";

export function registerValidate(program: Command): void {
  program
    .command("validate <skillPath>")
    .description("Validate a skill folder's SKILL.md and script declarations")
    .action((skillPath: string) => {
      let manifest;
      try {
        manifest = parseSkill(skillPath);
      } catch (err) {
        if (err instanceof ParseError) {
          console.error(chalk.red(`✗ ${err.message}`));
        } else {
          console.error(chalk.red(`✗ Unexpected error: ${String(err)}`));
        }
        process.exit(1);
      }

      const { frontmatter, warnings } = manifest;
      console.log(chalk.green(`\n✓ Valid skill: ${chalk.bold(frontmatter.name)}\n`));
      console.log(`  Description : ${frontmatter.description.slice(0, 80)}`);
      console.log(`  MCP servers : ${(frontmatter.mcp_servers ?? []).map((s) => s.name).join(", ") || "(none)"}`);
      console.log(`  Scripts     : ${(frontmatter.scripts ?? []).map((s) => s.name).join(", ") || "(none)"}`);
      console.log(`  License     : ${frontmatter.license ?? "(not specified)"}`);

      if (warnings.length > 0) {
        console.log();
        for (const w of warnings) {
          console.log(chalk.yellow(`  ⚠ ${w}`));
        }
      }
      console.log();
    });
}
