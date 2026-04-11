#!/usr/bin/env bun

import { parseArgs } from "./parse-args";
import { runCommand } from "./run-command";

const result = await runCommand(parseArgs(process.argv.slice(2)));

if (result.message) {
  const output = result.success ? console.info : console.error;
  output(result.message);
}

process.exit(result.success ? 0 : 1);
