import { and, eq, isNull } from "drizzle-orm";
import { AuthRuntimeDatabase } from "./runtime-db";
import {
  authIdentities,
  authSessions,
  oauthAuthCodes,
  oauthRefreshTokens,
  passkeyCredentials,
  setupTokens,
  webauthnChallenges,
} from "./runtime-schema";

export interface AuthPasskeyResetResult {
  passkeys: number;
  passkeyClaims: number;
  challenges: number;
  sessions: number;
  authorizationCodes: number;
  refreshTokens: number;
  setupTokens: number;
}

/** Atomically clear credential and active OAuth state while preserving users and clients. */
export async function resetAuthPasskeysStorage(
  storageDir: string,
): Promise<AuthPasskeyResetResult> {
  const database = new AuthRuntimeDatabase({ storageDir });
  await database.start();
  try {
    return await database.db.transaction(async (tx) => {
      const passkeys = await tx
        .delete(passkeyCredentials)
        .returning({ id: passkeyCredentials.id });
      const passkeyClaims = await tx
        .delete(authIdentities)
        .where(eq(authIdentities.type, "passkey"))
        .returning({ id: authIdentities.id });
      const challenges = await tx
        .delete(webauthnChallenges)
        .returning({ challengeHash: webauthnChallenges.challengeHash });
      const sessions = await tx
        .delete(authSessions)
        .returning({ tokenHash: authSessions.tokenHash });
      const authorizationCodes = await tx
        .delete(oauthAuthCodes)
        .returning({ codeHash: oauthAuthCodes.codeHash });
      const refreshTokens = await tx
        .delete(oauthRefreshTokens)
        .returning({ tokenHash: oauthRefreshTokens.tokenHash });
      const consumedSetupTokens = await tx
        .update(setupTokens)
        .set({ consumedAt: Math.floor(Date.now() / 1000) })
        .where(
          and(isNull(setupTokens.targetUserId), isNull(setupTokens.consumedAt)),
        )
        .returning({ tokenHash: setupTokens.tokenHash });
      return {
        passkeys: passkeys.length,
        passkeyClaims: passkeyClaims.length,
        challenges: challenges.length,
        sessions: sessions.length,
        authorizationCodes: authorizationCodes.length,
        refreshTokens: refreshTokens.length,
        setupTokens: consumedSetupTokens.length,
      };
    });
  } finally {
    await database.stop();
  }
}
