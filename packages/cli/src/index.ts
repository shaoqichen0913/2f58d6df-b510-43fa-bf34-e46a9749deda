#!/usr/bin/env node
// src/index.ts — CLI entry point
import { Command } from "commander";
import { createRequire } from "module";
import { registerList } from "./commands/list.js";
import { registerSearch } from "./commands/search.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerValidate } from "./commands/validate.js";
import { registerInstall } from "./commands/install.js";
import { registerUninstall } from "./commands/uninstall.js";
import { registerActivate } from "./commands/activate.js";
import { registerRun } from "./commands/run.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("skills")
  .description("Install, discover, and activate agent skills (OpenAI Codex compatible)")
  .version(version);

registerList(program);
registerSearch(program);
registerDoctor(program);
registerValidate(program);
registerInstall(program);
registerUninstall(program);
registerActivate(program);
registerRun(program);

program.parse(process.argv);
