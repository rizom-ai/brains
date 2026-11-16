#!/usr/bin/env bun
import { parseArgs } from "./parse-args";
import { runCommand } from "./run-command";
import { checkBunVersion } from "./lib/preflight";
import { reexecLocalBrain } from "./lib/local-reexec";
import { getInvocationCwd } from "./lib/invocation-cwd";
import { printCommandResult } from "./lib/print-command-result";

const bunCheck = checkBunVersion(Bun.version);
if (!bunCheck.ok) {
  console.error(bunCheck.message);
  process.exit(1);
}

const cwd = getInvocationCwd();

// Local over global: a local install that isn't this process runs the command.
const handedOff = await reexecLocalBrain({ cwd, args: process.argv.slice(2) });
if (handedOff !== undefined) process.exit(handedOff);

const parsed = parseArgs(process.argv.slice(2));
const status = printCommandResult(await runCommand(parsed, cwd));
if (status !== 0) process.exit(status);
