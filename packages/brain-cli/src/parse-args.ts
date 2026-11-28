import { parseArgs as parseNodeArgs } from "node:util";
import {
  buildParseArgsOptions,
  CliUsageError,
  parseCliArgs,
  type CliFlags,
  type ParsedCliArgs,
} from "@brains/deploy-support/cli-kit";
import { closestName } from "@brains/utils/string-utils";

import {
  brainCommandFlags,
  commandFlagScope,
  commands,
  globalFlags,
  type CommandFlagScope,
} from "./run-command";
import type { CommandResult } from "./lib/command-result";

export type ParsedArgs = ParsedCliArgs;

/** Every flag the parser knows; `commandFlagScope` says which a command takes. */
const parsedFlags = { ...globalFlags, ...brainCommandFlags };

/**
 * Parse CLI arguments into command, positional args, and flags.
 *
 * Usage: brain <command> [args] [--flag value]
 *
 * A built-in command accepts the global flags and its own; any other flag
 * throws a `CliUsageError` naming the flag and the command, so a removed or
 * mistyped flag is not silently dropped. A brain command also takes
 * `--<field> <value>` for its tool's input fields, which are known only once
 * the tool is found, so those flags are handed on and checked there.
 * `--help`/`--version` still win, and `eval` leaves its flags to the eval
 * runner.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const parsed = parseCliArgs(argv, {
    commands,
    globalFlags: parsedFlags,
    strict: false,
  });
  if (parsed.flags["help"] === true || parsed.flags["version"] === true) {
    return parsed;
  }

  const scope = commandFlagScope(parsed.command, parsed.args);
  if (!scope) return parsed;
  if (!scope.builtIn) {
    const brainCommand = parseBrainCommand(argv, scope.flags, parsed.flags);
    const brainScope = commandFlagScope(
      brainCommand.command,
      brainCommand.args,
    );
    if (!brainScope?.builtIn) return brainCommand;
  }

  const rejected = optionTokens(argv).find(
    ({ name }) => !scope.flags.includes(name) && !scope.internal.includes(name),
  );
  if (rejected) throw new CliUsageError(unknownFlagMessage(rejected, scope));
  return parsed;
}

type ArgToken = NonNullable<ReturnType<typeof parseNodeArgs>["tokens"]>[number];

function argTokens(argv: string[]): ArgToken[] {
  return parseNodeArgs({
    args: argv,
    options: buildParseArgsOptions(commands, parsedFlags),
    allowPositionals: true,
    strict: false,
    tokens: true,
  }).tokens;
}

interface OptionToken {
  /** Long name when the flag is defined, else the name as typed. */
  name: string;
  /** The flag as typed, e.g. `--cli` or `-x`. */
  rawName: string;
}

function optionTokens(argv: string[]): OptionToken[] {
  return argTokens(argv).flatMap((token) =>
    token.kind === "option"
      ? [{ name: token.name, rawName: token.rawName }]
      : [],
  );
}

/**
 * Read a brain command's argv. A flag outside `cliFlags` sets the input
 * field of that name: `--<field>=<value>`, `--<field> <value>` (taking the
 * next argument), or `--<field>` alone for a switch. The command is the
 * first argument no flag took.
 */
function parseBrainCommand(
  argv: string[],
  cliFlags: readonly string[],
  cliValues: CliFlags,
): ParsedArgs {
  const tokens = argTokens(argv);

  const fieldTokens = tokens.flatMap((token, position) =>
    token.kind === "option" && !cliFlags.includes(token.name)
      ? [{ token, next: tokens[position + 1] }]
      : [],
  );
  const shortFlag = fieldTokens.find(
    ({ token }) => !token.rawName.startsWith("--"),
  );
  if (shortFlag) {
    const command =
      tokens.find((token) => token.kind === "positional")?.value ?? "help";
    throw new CliUsageError(
      `Unknown flag ${shortFlag.token.rawName} for \`brain ${command}\`. Input fields take long flags, e.g. --environment preview. Run \`brain ${command} --help\` for the flags it accepts.`,
    );
  }

  const fields = fieldTokens.map(({ token, next }) => {
    const takesNext =
      token.value === undefined &&
      next?.kind === "positional" &&
      next.index === token.index + 1;
    return {
      name: token.name,
      value: token.value ?? (takesNext ? next.value : true),
      taken: takesNext ? next.index : undefined,
    };
  });
  const taken = new Set(fields.map(({ taken }) => taken));
  const positionals = tokens.flatMap((token) =>
    token.kind === "positional" && !taken.has(token.index) ? [token.value] : [],
  );

  const flags: CliFlags = Object.fromEntries([
    ...cliFlags.flatMap((name) => {
      const value = cliValues[name];
      return value === undefined ? [] : [[name, value]];
    }),
    ...fields.map(({ name, value }) => [name, value]),
  ]);
  return {
    command: positionals[0] ?? "help",
    args: positionals.slice(1),
    flags,
  };
}

function unknownFlagMessage(
  flag: OptionToken,
  scope: CommandFlagScope,
): string {
  const suggestion = flag.rawName.startsWith("--")
    ? closestName(flag.name, scope.flags)
    : undefined;
  return [
    `Unknown flag ${flag.rawName} for \`brain ${scope.name}\`.`,
    ...(suggestion ? [`Did you mean --${suggestion}?`] : []),
    `Run \`brain ${scope.name} --help\` for the flags it accepts.`,
  ].join(" ");
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
