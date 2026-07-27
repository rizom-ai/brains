import { resolve } from "node:path";
import { resetAuthPasskeysStorage } from "@brains/auth-service";
import type { CommandResult } from "../lib/command-result";

export interface AuthResetPasskeysOptions {
  storageDir?: string | undefined;
  yes?: boolean | undefined;
}

/** Local break-glass recovery for lost or compromised auth passkeys. */
export async function resetAuthPasskeys(
  cwd: string,
  options: AuthResetPasskeysOptions = {},
): Promise<CommandResult> {
  if (!options.yes) {
    return {
      success: false,
      message:
        "Refusing to reset auth passkeys without --yes. This clears passkeys, sessions, authorization codes, and refresh tokens.",
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

  try {
    const result = await resetAuthPasskeysStorage(storageDir);
    return {
      success: true,
      message: `Auth passkeys and active OAuth state reset atomically in ${resolve(storageDir, "auth.db")}: ${result.passkeys} passkeys, ${result.passkeyClaims} passkey claims, ${result.challenges} challenges, ${result.sessions} sessions, ${result.authorizationCodes} authorization codes, and ${result.refreshTokens} refresh tokens removed; ${result.setupTokens} global setup links invalidated. Restart the brain to print a new one-shot /setup token. Users, OAuth clients, and signing keys were preserved.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to reset auth passkeys: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function isBrainDataPath(path: string): boolean {
  return path.split(/[\\/]+/).includes("brain-data");
}
