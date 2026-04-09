import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { type PushTarget, vaultNameForInstance } from "./push-target";
import { runSubprocess, type RunCommand } from "./run-subprocess";

export type SecretPair = readonly [name: string, value: string];

export interface PushSecretsOptions {
  cwd: string;
  opToken?: string | undefined;
  runCommand?: RunCommand | undefined;
  logger?: ((message: string) => void) | undefined;
}

export interface PushSecretsResult {
  vaultName?: string | undefined;
}

export async function pushSecretsToBackend(
  target: PushTarget,
  secrets: readonly SecretPair[],
  options: PushSecretsOptions,
): Promise<PushSecretsResult> {
  const runCommand = options.runCommand ?? runSubprocess;
  const logger = options.logger ?? console.log;

  switch (target) {
    case "gh":
      logger(
        `Pushing ${secrets.length} env-backed secrets to GitHub Secrets...`,
      );
      await Promise.all(
        secrets.map(([name, value]) =>
          runCommand("gh", ["secret", "set", name], { stdin: value }),
        ),
      );
      return {};

    case "1password": {
      if (!options.opToken) {
        throw new Error(
          "Missing OP_TOKEN (or OP_SERVICE_ACCOUNT_TOKEN) for 1Password push",
        );
      }
      const vaultName = vaultNameForInstance(options.cwd);
      logger(
        `Pushing ${secrets.length} env-backed secrets to 1Password vault ${vaultName}...`,
      );
      const opEnv = { OP_SERVICE_ACCOUNT_TOKEN: options.opToken };
      const tempDir = mkdtempSync(join(tmpdir(), "brain-push-secrets-"));
      try {
        await Promise.all(
          secrets.map(([name, value]) => {
            const filePath = join(tempDir, name);
            writeFileSync(filePath, value, { encoding: "utf-8", mode: 0o600 });
            return runCommand(
              "op",
              [
                "document",
                "create",
                filePath,
                "--vault",
                vaultName,
                "--title",
                name,
              ],
              { env: opEnv },
            );
          }),
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
      return { vaultName };
    }
  }
}
