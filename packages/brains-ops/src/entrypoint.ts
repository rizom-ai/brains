#!/usr/bin/env bun

import { CliUsageError } from "@brains/deploy-support/cli-kit";
import { parseArgs } from "./parse-args";
import { runCommand } from "./run-command";
import type { CommandResult } from "./run-command";

let result: CommandResult;
try {
  result = await runCommand(parseArgs(process.argv.slice(2)));
} catch (error) {
  if (error instanceof CliUsageError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

if (result.message) {
  const output = result.success ? console.info : console.error;
  output(result.message);
}

process.exit(result.success ? 0 : 1);
