#!/usr/bin/env bun
import { parseArgs } from "./parse-args";
import { runCommand } from "./run-command";
import { checkBunVersion } from "./lib/preflight";

const bunCheck = checkBunVersion(Bun.version);
if (!bunCheck.ok) {
  console.error(bunCheck.message);
  process.exit(1);
}

const parsed = parseArgs(process.argv.slice(2));
const result = await runCommand(parsed);

if (!result.success) {
  console.error(result.message);
  process.exit(1);
}

if (result.message) {
  console.log(result.message);
}
