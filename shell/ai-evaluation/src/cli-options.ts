export interface CliOptions {
  skipLLMJudge: boolean;
  parallel: boolean;
  maxParallel: number;
  verbose: boolean;
  tags?: string[];
  testCaseIds?: string[];
  testType?: "agent" | "plugin";
  remoteUrl?: string;
  authToken?: string;
  compareAgainst?: string;
  saveBaseline?: string;
}

/**
 * Parse a comma-separated flag value from args.
 */
export function parseFlag(args: string[], flag: string): string[] | undefined {
  const value = parseSingleFlag(args, flag);
  return value ? value.split(",") : undefined;
}

/**
 * Parse a single string flag value from args.
 */
export function parseSingleFlag(
  args: string[],
  flag: string,
): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;

  const value = args[index + 1];
  if (!value || value.startsWith("--")) return undefined;

  return value;
}

export function parseCliOptions(args: string[]): CliOptions {
  const maxParallelArg = parseSingleFlag(args, "--max-parallel");
  const testTypeArg = parseSingleFlag(args, "--type");
  const tags = parseFlag(args, "--tags");
  const testCaseIds = parseFlag(args, "--test") ?? parseFlag(args, "--filter");
  const remoteUrl = parseSingleFlag(args, "--url");
  const authToken = parseSingleFlag(args, "--token");
  const saveBaseline = parseSingleFlag(args, "--baseline");

  const options: CliOptions = {
    skipLLMJudge: args.includes("--skip-llm-judge"),
    parallel: args.includes("--parallel") || args.includes("-p"),
    maxParallel: maxParallelArg ? parseInt(maxParallelArg, 10) : 3,
    verbose: args.includes("--verbose") || args.includes("-v"),
  };

  if (tags) options.tags = tags;
  if (testCaseIds) options.testCaseIds = testCaseIds;
  if (testTypeArg === "agent" || testTypeArg === "plugin") {
    options.testType = testTypeArg;
  }
  if (remoteUrl) options.remoteUrl = remoteUrl;
  if (authToken) options.authToken = authToken;
  if (args.includes("--compare")) {
    options.compareAgainst = parseSingleFlag(args, "--compare") ?? "";
  }
  if (saveBaseline) options.saveBaseline = saveBaseline;

  return options;
}
