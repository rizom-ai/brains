import { parseArgs as parseNodeArgs } from "node:util";
import {
  buildParseArgsOptions,
  CliUsageError,
  parseCliArgs,
  type ParsedCliArgs,
} from "@brains/deploy-support/cli-kit";

import {
  commandFlagScope,
  commands,
  globalFlags,
  type CommandFlagScope,
} from "./run-command";
import type { CommandResult } from "./lib/command-result";

export type ParsedArgs = ParsedCliArgs;

/** How far a typo may be from a flag for the flag to be suggested. */
const SUGGESTION_DISTANCE = 2;

/**
 * Parse CLI arguments into command, positional args, and flags.
 *
 * Usage: brain <command> [args] [--flag value]
 *
 * Each command accepts the global flags and its own. Any other flag throws a
 * `CliUsageError` naming the flag and the command, so a removed or mistyped
 * flag is not silently dropped. `--help`/`--version` still win, and `eval`
 * leaves its flags to the eval runner.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const parsed = parseCliArgs(argv, { commands, globalFlags, strict: false });
  if (parsed.flags["help"] === true || parsed.flags["version"] === true) {
    return parsed;
  }

  const scope = commandFlagScope(parsed.command, parsed.args);
  if (!scope) return parsed;

  const rejected = optionTokens(argv).find(
    ({ name }) => !scope.flags.includes(name) && !scope.internal.includes(name),
  );
  if (rejected) throw new CliUsageError(unknownFlagMessage(rejected, scope));
  return parsed;
}

interface OptionToken {
  /** Long name when the flag is defined, else the name as typed. */
  name: string;
  /** The flag as typed, e.g. `--cli` or `-x`. */
  rawName: string;
}

function optionTokens(argv: string[]): OptionToken[] {
  const { tokens } = parseNodeArgs({
    args: argv,
    options: buildParseArgsOptions(commands, globalFlags),
    allowPositionals: true,
    strict: false,
    tokens: true,
  });
  return tokens.flatMap((token) =>
    token.kind === "option"
      ? [{ name: token.name, rawName: token.rawName }]
      : [],
  );
}

function unknownFlagMessage(
  flag: OptionToken,
  scope: CommandFlagScope,
): string {
  const suggestion = flag.rawName.startsWith("--")
    ? closestFlag(flag.name, scope.flags)
    : undefined;
  return [
    `Unknown flag ${flag.rawName} for \`brain ${scope.name}\`.`,
    ...(suggestion ? [`Did you mean --${suggestion}?`] : []),
    `Run \`brain ${scope.name} --help\` for the flags it accepts.`,
  ].join(" ");
}

function closestFlag(
  name: string,
  candidates: readonly string[],
): string | undefined {
  return candidates
    .map((candidate) => ({
      candidate,
      distance: editDistance(name, candidate),
    }))
    .filter(({ distance }) => distance <= SUGGESTION_DISTANCE)
    .sort((a, b) => a.distance - b.distance)[0]?.candidate;
}

/** Levenshtein distance: single-character inserts, deletes and swaps. */
function editDistance(a: string, b: string): number {
  const firstRow = Array.from({ length: b.length + 1 }, (_, j) => j);
  const lastRow = [...a].reduce(
    (previous, charA, i) =>
      [...b].reduce<number[]>(
        (row, charB, j) => [
          ...row,
          Math.min(
            (previous[j + 1] ?? 0) + 1,
            (row[j] ?? 0) + 1,
            (previous[j] ?? 0) + (charA === charB ? 0 : 1),
          ),
        ],
        [i + 1],
      ),
    firstRow,
  );
  return lastRow[b.length] ?? 0;
}

/**
 * `parseArgs` for an entrypoint: a usage error becomes the failed result the
 * CLI prints, instead of an uncaught exception with a stack trace.
 */
export function parseCommandLine(
  argv: string[],
): { parsed: ParsedArgs } | { failure: CommandResult } {
  try {
    return { parsed: parseArgs(argv) };
  } catch (error) {
    if (!(error instanceof CliUsageError)) throw error;
    return { failure: { success: false, message: error.message } };
  }
}
