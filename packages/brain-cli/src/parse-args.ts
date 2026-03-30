import { parseArgs as nodeParseArgs } from "util";

export interface ParsedArgs {
  command: string;
  args: string[];
  flags: {
    model?: string | undefined;
    domain?: string | undefined;
    "content-repo"?: string | undefined;
    preview?: boolean | undefined;
    remote?: string | undefined;
    token?: string | undefined;
    help?: boolean | undefined;
    version?: boolean | undefined;
  };
}

const options = {
  model: { type: "string" as const },
  domain: { type: "string" as const },
  "content-repo": { type: "string" as const },
  preview: { type: "boolean" as const },
  remote: { type: "string" as const },
  token: { type: "string" as const },
  help: { type: "boolean" as const, short: "h" },
  version: { type: "boolean" as const, short: "v" },
};

function getString(
  values: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = values[key];
  return typeof v === "string" ? v : undefined;
}

function getBoolean(
  values: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const v = values[key];
  return typeof v === "boolean" ? v : undefined;
}

/**
 * Parse CLI arguments into command, positional args, and flags.
 *
 * Usage: brain <command> [args] [--flag value]
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const { values, positionals } = nodeParseArgs({
    args: argv,
    options,
    allowPositionals: true,
    strict: false,
  });

  if (values["help"]) {
    return { command: "help", args: [], flags: { help: true } };
  }

  if (values["version"]) {
    return { command: "version", args: [], flags: { version: true } };
  }

  const command = positionals[0] ?? "help";

  return {
    command,
    args: positionals.slice(1),
    flags: {
      model: getString(values, "model"),
      domain: getString(values, "domain"),
      "content-repo": getString(values, "content-repo"),
      preview: getBoolean(values, "preview"),
      remote: getString(values, "remote"),
      token: getString(values, "token"),
    },
  };
}
