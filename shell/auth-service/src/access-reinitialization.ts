import type { RuntimeInterfacePrincipalState } from "@brains/contracts";
import { AuthAuditStore } from "./audit-store";
import {
  InterfacePrincipalStore,
  type ConfiguredInterfacePrincipals,
} from "./interface-principal-store";
import { RuntimeRefreshTokenStore } from "./refresh-token-store";
import { AuthRuntimeDatabase } from "./runtime-db";
import { RuntimeAuthSessionStore } from "./session-store";
import { AuthUserStore } from "./user-store";

export interface ReinitializeAuthAccessResult {
  state: RuntimeInterfacePrincipalState;
  revokedSessions: number;
  revokedRefreshTokens: number;
}

interface ReinitializeAuthAccessStores {
  principalStore: InterfacePrincipalStore;
  userStore: AuthUserStore;
  sessionStore: RuntimeAuthSessionStore;
  refreshTokenStore: RuntimeRefreshTokenStore;
  auditStore: AuthAuditStore;
}

export async function reinitializeAuthAccessStores(
  stores: ReinitializeAuthAccessStores,
  config: ConfiguredInterfacePrincipals,
  actorUserId?: string,
): Promise<ReinitializeAuthAccessResult> {
  await stores.principalStore.reinitializeFromConfig(config);
  let revokedSessions = 0;
  let revokedRefreshTokens = 0;
  for (const user of await stores.userStore.listUsers()) {
    revokedSessions += await stores.sessionStore.revokeSessionsForSubject(
      user.id,
    );
    revokedRefreshTokens +=
      await stores.refreshTokenStore.revokeTokensForSubject(user.id);
  }
  const state = await stores.principalStore.listActiveState();
  await stores.auditStore.append({
    ...(actorUserId ? { actorUserId } : {}),
    action: "auth.access.reinitialized",
    targetType: "access",
    metadata: {
      grants: state.grants.length,
      anchors: state.anchors.length,
      revokedSessions,
      revokedRefreshTokens,
    },
  });
  return { state, revokedSessions, revokedRefreshTokens };
}

/**
 * Offline break-glass access recovery. This opens only auth.db, replaces exact
 * grants and Anchor bindings, and revokes login state without initializing the
 * full auth service or changing people, users, passkeys, keys, or OAuth clients.
 */
export async function reinitializeAuthAccessStorage(
  storageDir: string,
  config: ConfiguredInterfacePrincipals,
): Promise<ReinitializeAuthAccessResult> {
  const database = new AuthRuntimeDatabase({ storageDir });
  await database.start();
  try {
    const principalStore = new InterfacePrincipalStore(database.db);
    const userStore = new AuthUserStore(database.db);
    const sessionStore = new RuntimeAuthSessionStore(database);
    const refreshTokenStore = new RuntimeRefreshTokenStore(database);
    const auditStore = new AuthAuditStore(database.db);

    return await reinitializeAuthAccessStores(
      {
        principalStore,
        userStore,
        sessionStore,
        refreshTokenStore,
        auditStore,
      },
      config,
    );
  } finally {
    await database.stop();
  }
}
