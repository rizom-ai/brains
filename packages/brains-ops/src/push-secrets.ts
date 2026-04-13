import { normalizePushTarget, type PushTarget } from "./push-target";
import { runSubprocess, type RunCommand } from "./run-subprocess";

export type SecretPair = readonly [name: string, value: string];

export interface PushSecretsOptions {
  runCommand?: RunCommand | undefined;
  logger?: ((message: string) => void) | undefined;
}

export async function pushSecretsToBackend(
  target: PushTarget,
  secrets: readonly SecretPair[],
  options: PushSecretsOptions = {},
): Promise<void> {
  const runCommand = options.runCommand ?? runSubprocess;
  const logger = options.logger ?? console.log;

  switch (target) {
    case "gh":
      logger(`Pushing ${secrets.length} secrets to GitHub Secrets...`);
      await Promise.all(
        secrets.map(([name, value]) =>
          runCommand("gh", ["secret", "set", name], { stdin: value }),
        ),
      );
      return;
  }
}

export { normalizePushTarget };
