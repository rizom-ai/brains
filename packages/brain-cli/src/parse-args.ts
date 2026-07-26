import {
  parseCliArgs,
  type ParsedCliArgs,
} from "@brains/deploy-support/cli-kit";

import { commands, globalFlags } from "./run-command";

export type ParsedArgs = ParsedCliArgs;

/**
 * Parse CLI arguments into command, positional args, and flags.
 *
 * Usage: brain <command> [args] [--flag value]
 *
 * Non-strict: unknown flags are tolerated (and dropped) so dynamic brain
 * commands can receive arbitrary positionals without tripping the parser.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  return parseCliArgs(argv, { commands, globalFlags, strict: false });
}
