import { parseArgs as nodeParseArgs } from "node:util";

export interface ParsedArgs {
  command: string;
  args: string[];
  flags: {
    help?: boolean | undefined;
    version?: boolean | undefined;
    dryRun?: boolean | undefined;
    pushTo?: string | undefined;
    cohort?: string | undefined;
    anchorId?: string | undefined;
  };
}

const options = {
  help: { type: "boolean" as const, short: "h" },
  version: { type: "boolean" as const, short: "v" },
  "dry-run": { type: "boolean" as const },
  "push-to": { type: "string" as const },
  cohort: { type: "string" as const },
  "anchor-id": { type: "string" as const },
};

function getBoolean(
  values: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = values[key];
  return typeof value === "boolean" ? value : undefined;
}

function getString(
  values: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = values[key];
  return typeof value === "string" ? value : undefined;
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
      dryRun: getBoolean(values, "dry-run"),
      pushTo: getString(values, "push-to"),
      cohort: getString(values, "cohort"),
      anchorId: getString(values, "anchor-id"),
    },
  };
}
