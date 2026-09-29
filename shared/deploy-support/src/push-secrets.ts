import { runSubprocess, type RunCommand } from "./run-subprocess";

export type SecretPair = readonly [name: string, value: string];

export interface PushSecretsOptions {
  runCommand?: RunCommand | undefined;
  logger?: ((message: string) => void) | undefined;
}

/** Log a header with count followed by one indented line per key. */
export function logKeyGroup(
  logger: (message: string) => void,
  header: string,
  keys: readonly string[],
): void {
  if (keys.length === 0) {
    return;
  }
  logger(`${header} (${keys.length}):`);
  for (const key of keys) {
    logger(`  - ${key}`);
  }
}

/**
 * Report skipped secret keys, split into a required group ("Required before
 * first deploy") and an optional group ("Safe to ignore for now").
 */
export function logMissingSecrets(
  logger: (message: string) => void,
  skippedKeys: readonly string[],
  isRequired: (key: string) => boolean,
): void {
  const required = skippedKeys.filter((key) => isRequired(key));
  const optional = skippedKeys.filter((key) => !isRequired(key));

  logKeyGroup(logger, "Required before first deploy", required);
  logKeyGroup(logger, "Safe to ignore for now", optional);
}

/** Stores each secret as a GitHub Actions secret, where deploy workflows read them. */
export async function pushSecretsToGitHub(
  secrets: readonly SecretPair[],
  options: PushSecretsOptions = {},
): Promise<void> {
  const runCommand = options.runCommand ?? runSubprocess;
  const logger = options.logger ?? console.log;

  logger(`Pushing ${secrets.length} secrets to GitHub Secrets...`);
  await Promise.all(
    secrets.map(([name, value]) =>
      runCommand("gh", ["secret", "set", name], { stdin: value }),
    ),
  );
}
