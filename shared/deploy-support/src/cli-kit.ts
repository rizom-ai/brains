import { parseArgs as nodeParseArgs } from "node:util";

/**
 * Minimal command-definition kit shared by the brain and brains-ops CLIs.
 *
 * A CLI declares each command once via `defineCommand` — name, description,
 * usage signature, flags, and run function — and derives everything else
 * from that single source of truth:
 *
 *   - `buildParseArgsOptions` → the `node:util` parseArgs options object
 *   - `renderHelp` / `renderCommandList` / `renderFlagList` → help text
 *   - `createCommandRegistry` + `resolveSubcommand` → dispatch
 */

export type CliFlagValue = string | boolean;

/** Parsed flag values, keyed by long flag name (e.g. "push-to"). */
export type CliFlags = Record<string, CliFlagValue | undefined>;

export interface FlagDefinition {
  type: "string" | "boolean";
  short?: string | undefined;
  description: string;
  default?: CliFlagValue | undefined;
  /** Value placeholder shown in help for string flags, e.g. "<url>". */
  placeholder?: string | undefined;
}

export type FlagDefinitions = Record<string, FlagDefinition>;

/** Arguments handed to a command's run function. */
export interface CommandInvocation {
  args: string[];
  flags: CliFlags;
}

/** The help/parse-relevant surface of a command (no run function). */
export interface CommandInfo {
  name: string;
  description: string;
  /** Positional/flag signature for usage lines, e.g. "<repo> <handle>". */
  usage?: string | undefined;
  flags?: FlagDefinitions | undefined;
}

export interface CommandDefinition<TContext, TResult> extends CommandInfo {
  run: (
    invocation: CommandInvocation,
    context: TContext,
  ) => TResult | Promise<TResult>;
}

/** Identity helper that pins the definition shape and infers types. */
export function defineCommand<TContext, TResult>(
  definition: CommandDefinition<TContext, TResult>,
): CommandDefinition<TContext, TResult> {
  return definition;
}

/** Thrown for user-facing argument errors (unknown flag, missing value). */
export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export interface ParseArgsFlagOption {
  type: "string" | "boolean";
  short?: string;
  default?: CliFlagValue;
}

export type ParseArgsOptions = Record<string, ParseArgsFlagOption>;

function mergeFlagDefinitions(
  commands: readonly CommandInfo[],
  globalFlags: FlagDefinitions,
): FlagDefinitions {
  const merged: FlagDefinitions = { ...globalFlags };

  for (const command of commands) {
    for (const [name, definition] of Object.entries(command.flags ?? {})) {
      const existing = merged[name];
      if (existing === undefined) {
        merged[name] = definition;
        continue;
      }
      if (
        existing.type !== definition.type ||
        existing.short !== definition.short ||
        existing.default !== definition.default
      ) {
        throw new Error(
          `Conflicting definitions for flag --${name}: commands must agree on type, short, and default`,
        );
      }
    }
  }

  return merged;
}

function optionsFromDefinitions(
  definitions: FlagDefinitions,
): ParseArgsOptions {
  const options: ParseArgsOptions = {};

  for (const [name, definition] of Object.entries(definitions)) {
    options[name] = {
      type: definition.type,
      ...(definition.short !== undefined ? { short: definition.short } : {}),
      ...(definition.default !== undefined
        ? { default: definition.default }
        : {}),
    };
  }

  return options;
}

/** Derive the `node:util` parseArgs options object from command definitions. */
export function buildParseArgsOptions(
  commands: readonly CommandInfo[],
  globalFlags: FlagDefinitions = {},
): ParseArgsOptions {
  return optionsFromDefinitions(mergeFlagDefinitions(commands, globalFlags));
}

export interface ParsedCliArgs {
  command: string;
  args: string[];
  flags: CliFlags;
}

export interface ParseCliOptions {
  commands: readonly CommandInfo[];
  globalFlags?: FlagDefinitions | undefined;
  /** Reject unknown flags. Defaults to true; pass false for CLIs that
   * forward arbitrary flags to dynamic commands. */
  strict?: boolean | undefined;
}

function isParseArgsUsageError(error: unknown): error is Error {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }
  return (
    error.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" ||
    error.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE"
  );
}

/**
 * Parse argv into `{ command, args, flags }` using options derived from the
 * command definitions. `--help`/`--version` anywhere route to the `help` /
 * `version` commands. Unknown flags throw `CliUsageError` in strict mode and
 * are dropped otherwise. The command defaults to `help` when absent.
 */
export function parseCliArgs(
  argv: string[],
  options: ParseCliOptions,
): ParsedCliArgs {
  const definitions = mergeFlagDefinitions(
    options.commands,
    options.globalFlags ?? {},
  );

  let values: Record<string, unknown>;
  let positionals: string[];
  try {
    ({ values, positionals } = nodeParseArgs({
      args: argv,
      options: optionsFromDefinitions(definitions),
      allowPositionals: true,
      strict: options.strict ?? true,
    }));
  } catch (error) {
    if (isParseArgsUsageError(error)) {
      throw new CliUsageError(error.message.split(". ")[0] ?? error.message);
    }
    throw error;
  }

  if ("help" in definitions && values["help"] === true) {
    return { command: "help", args: [], flags: { help: true } };
  }

  if ("version" in definitions && values["version"] === true) {
    return { command: "version", args: [], flags: { version: true } };
  }

  const flags: CliFlags = {};
  for (const [name, definition] of Object.entries(definitions)) {
    const value = values[name];
    if (typeof value === "string" && definition.type === "string") {
      flags[name] = value;
    } else if (typeof value === "boolean" && definition.type === "boolean") {
      flags[name] = value;
    }
  }

  return {
    command: positionals[0] ?? "help",
    args: positionals.slice(1),
    flags,
  };
}

function padColumns(
  entries: readonly { label: string; description: string }[],
): string[] {
  const width = entries.reduce(
    (max, entry) => Math.max(max, entry.label.length),
    0,
  );
  return entries.map(
    (entry) => `  ${entry.label.padEnd(width)}  ${entry.description}`,
  );
}

/** Render the aligned `Commands:` block lines from command definitions. */
export function renderCommandList(commands: readonly CommandInfo[]): string[] {
  return padColumns(
    commands.map((command) => ({
      label: command.usage ? `${command.name} ${command.usage}` : command.name,
      description: command.description,
    })),
  );
}

function flagLabel(name: string, definition: FlagDefinition): string {
  const value =
    definition.type === "string"
      ? ` ${definition.placeholder ?? "<value>"}`
      : "";
  const short = definition.short !== undefined ? `, -${definition.short}` : "";
  return `--${name}${value}${short}`;
}

/** Render aligned option lines from flag definitions. */
export function renderFlagList(flags: FlagDefinitions): string[] {
  return padColumns(
    Object.entries(flags).map(([name, definition]) => ({
      label: flagLabel(name, definition),
      description: definition.description,
    })),
  );
}

/** Render a `Usage: <cli> <name> <usage>` line for a command. */
export function renderUsage(cliName: string, command: CommandInfo): string {
  return `Usage: ${cliName} ${command.name}${
    command.usage ? ` ${command.usage}` : ""
  }`;
}

function flagSetSignature(flags: FlagDefinitions): string {
  return JSON.stringify(
    Object.entries(flags)
      .map(([name, definition]) => [
        name,
        definition.type,
        definition.short ?? "",
        definition.description,
        definition.placeholder ?? "",
        definition.default ?? "",
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

/**
 * Render per-command option sections, grouping commands that share an
 * identical flag set (e.g. "cert:bootstrap / ssh-key:bootstrap options:").
 * Each section is preceded by a blank line.
 */
export function renderCommandFlagSections(
  commands: readonly CommandInfo[],
): string[] {
  const groups: { names: string[]; flags: FlagDefinitions }[] = [];
  const groupBySignature = new Map<string, { names: string[] }>();

  for (const command of commands) {
    const flags = command.flags ?? {};
    if (Object.keys(flags).length === 0) {
      continue;
    }
    const signature = flagSetSignature(flags);
    const existing = groupBySignature.get(signature);
    if (existing) {
      existing.names.push(command.name);
      continue;
    }
    const group = { names: [command.name], flags };
    groupBySignature.set(signature, group);
    groups.push(group);
  }

  const lines: string[] = [];
  for (const group of groups) {
    lines.push("", `${group.names.join(" / ")} options:`);
    lines.push(...renderFlagList(group.flags));
  }
  return lines;
}

export interface RenderHelpOptions {
  cliName: string;
  intro: string;
  /** Usage suffix after the CLI name; defaults to `<command> [args]`. */
  usage?: string | undefined;
  commands: readonly CommandInfo[];
  globalFlags?: FlagDefinitions | undefined;
}

/** Compose a complete help text from command definitions. */
export function renderHelp(options: RenderHelpOptions): string {
  const lines = [
    options.intro,
    "",
    `Usage: ${options.cliName} ${options.usage ?? "<command> [args]"}`,
    "",
    "Commands:",
    ...renderCommandList(options.commands),
  ];

  if (options.globalFlags && Object.keys(options.globalFlags).length > 0) {
    lines.push("", "Options:", ...renderFlagList(options.globalFlags));
  }

  lines.push(...renderCommandFlagSections(options.commands));

  return lines.join("\n");
}

/** Build a name → definition lookup, rejecting duplicate command names. */
export function createCommandRegistry<TContext, TResult>(
  commands: readonly CommandDefinition<TContext, TResult>[],
): ReadonlyMap<string, CommandDefinition<TContext, TResult>> {
  const registry = new Map<string, CommandDefinition<TContext, TResult>>();
  for (const command of commands) {
    if (registry.has(command.name)) {
      throw new Error(`Duplicate command name: ${command.name}`);
    }
    registry.set(command.name, command);
  }
  return registry;
}

export interface ResolvedCommand {
  name: string;
  args: string[];
}

/**
 * Collapse space-form subcommands onto colon-form registry names:
 * `cert bootstrap` resolves to `cert:bootstrap` (consuming the first
 * positional) when the colon-form name is registered. Registered and
 * unknown commands pass through unchanged.
 */
export function resolveSubcommand(
  registry: { has(name: string): boolean },
  command: string,
  args: string[],
): ResolvedCommand {
  if (!registry.has(command)) {
    const subcommand = args[0];
    if (subcommand !== undefined && registry.has(`${command}:${subcommand}`)) {
      return { name: `${command}:${subcommand}`, args: args.slice(1) };
    }
  }
  return { name: command, args };
}

/** Return the flag's value when it is a string, else undefined. */
export function getStringFlag(
  flags: CliFlags,
  name: string,
): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

/** Return the flag's value when it is a boolean, else undefined. */
export function getBooleanFlag(
  flags: CliFlags,
  name: string,
): boolean | undefined {
  const value = flags[name];
  return typeof value === "boolean" ? value : undefined;
}
