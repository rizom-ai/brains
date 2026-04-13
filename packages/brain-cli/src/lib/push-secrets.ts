import { type PushTarget } from "./push-target";
import { runSubprocess, type RunCommand } from "./run-subprocess";

export type SecretPair = readonly [name: string, value: string];

export interface PushSecretsOptions {
  cwd: string;
  runCommand?: RunCommand | undefined;
  logger?: ((message: string) => void) | undefined;
}

export interface PushSecretsResult {
  vaultName?: string | undefined;
}

export async function pushSecretsToBackend(
  _target: PushTarget,
  secrets: readonly SecretPair[],
  options: PushSecretsOptions,
): Promise<PushSecretsResult> {
  const runCommand = options.runCommand ?? runSubprocess;
  const logger = options.logger ?? console.log;

  logger(`Pushing ${secrets.length} env-backed secrets to GitHub Secrets...`);
  await Promise.all(
    secrets.map(([name, value]) =>
      runCommand("gh", ["secret", "set", name], { stdin: value }),
    ),
  );
  return {};
}
