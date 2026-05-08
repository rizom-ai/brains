import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { CommandResult } from "../run-command";

export interface AuthResetPasskeysOptions {
  storageDir?: string | undefined;
  yes?: boolean | undefined;
}

const RESET_FILES = [
  {
    name: "oauth-passkeys.json",
    value: {
      credentials: [],
      registrationChallenges: [],
      authenticationChallenges: [],
    },
  },
  { name: "oauth-sessions.json", value: { sessions: [] } },
  { name: "oauth-auth-codes.json", value: { codes: [] } },
  { name: "oauth-refresh-tokens.json", value: { refreshTokens: [] } },
] as const;

/**
 * Local break-glass recovery for lost/compromised operator passkeys.
 *
 * This intentionally preserves OAuth clients and the signing key. It clears the
 * human operator credentials and active OAuth/session state; after restart,
 * AuthService sees no passkeys and prints a fresh one-shot /setup URL.
 */
export async function resetAuthPasskeys(
  cwd: string,
  options: AuthResetPasskeysOptions = {},
): Promise<CommandResult> {
  if (!options.yes) {
    return {
      success: false,
      message:
        "Refusing to reset operator passkeys without --yes. This clears passkeys, sessions, authorization codes, and refresh tokens.",
    };
  }

  const storageDir = resolve(cwd, options.storageDir ?? "./data/auth");
  if (isBrainDataPath(storageDir)) {
    return {
      success: false,
      message:
        "Refusing to modify auth state under brain-data. Auth storage must live outside content/brain-data.",
    };
  }

  for (const file of RESET_FILES) {
    const filePath = resolve(storageDir, file.name);
    await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
    await writeFile(filePath, `${JSON.stringify(file.value, null, 2)}\n`, {
      mode: 0o600,
    });
    await chmod(filePath, 0o600);
  }

  return {
    success: true,
    message: `Operator passkeys and active OAuth state reset in ${storageDir}. Restart the brain to print a new one-shot /setup token. OAuth clients and signing keys were preserved.`,
  };
}

function isBrainDataPath(path: string): boolean {
  return path.split(/[\\/]+/).includes("brain-data");
}
