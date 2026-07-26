import {
  parseCliArgs,
  type ParsedCliArgs,
} from "@brains/deploy-support/cli-kit";

import { commands, globalFlags } from "./run-command";

export type ParsedArgs = ParsedCliArgs;

export function parseArgs(argv: string[]): ParsedArgs {
  return parseCliArgs(argv, { commands, globalFlags });
}
