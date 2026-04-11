import { parseArgs as nodeParseArgs } from "node:util";

export interface ParsedArgs {
  command: string;
  args: string[];
  flags: {
    help?: boolean | undefined;
    version?: boolean | undefined;
  };
}

const options = {
  help: { type: "boolean" as const, short: "h" },
  version: { type: "boolean" as const, short: "v" },
};

function getBoolean(
  values: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = values[key];
  return typeof value === "boolean" ? value : undefined;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const { values, positionals } = nodeParseArgs({
    args: argv,
    options,
    allowPositionals: true,
  });

  if (values.help) {
    return { command: "help", args: [], flags: { help: true } };
  }

  if (values.version) {
    return { command: "version", args: [], flags: { version: true } };
  }

  return {
    command: positionals[0] ?? "help",
    args: positionals.slice(1),
    flags: {
      help: getBoolean(values, "help"),
      version: getBoolean(values, "version"),
    },
  };
}
