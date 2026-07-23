import {
  hashInterfacePrincipal,
  parseConfiguredInterfacePrincipal,
  type RuntimeInterfacePrincipalState,
} from "@brains/contracts";
import { createPrefixedId } from "@brains/utils/id";
import { and, eq, isNull } from "drizzle-orm";
import type { AuthRuntimeDB } from "./runtime-db";
import {
  authAccessSeedState,
  interfaceAnchorBindings,
  interfacePrincipalGrants,
} from "./runtime-schema";

export interface ConfiguredInterfacePrincipals {
  admins: string[];
  trusted: string[];
  anchors: string[];
}

export interface ResolvedInterfacePrincipal {
  permissionLevel: "admin" | "trusted" | "public";
  isAnchor: boolean;
}

type PreparedPrincipalState = RuntimeInterfacePrincipalState;

export class InterfacePrincipalStore {
  private readonly db: AuthRuntimeDB;

  constructor(db: AuthRuntimeDB) {
    this.db = db;
  }

  async seedConfigOnce(
    config: ConfiguredInterfacePrincipals,
  ): Promise<boolean> {
    const prepared = prepareConfigState(config);
    return this.db.transaction(async (tx) => {
      const now = Date.now();
      const inserted = await tx
        .insert(authAccessSeedState)
        .values({ id: "config", seededAt: now, updatedAt: now })
        .onConflictDoNothing()
        .returning({ id: authAccessSeedState.id });
      if (inserted.length === 0) return false;

      await insertPreparedState(tx, prepared, now);
      return true;
    });
  }

  async reinitializeFromConfig(
    config: ConfiguredInterfacePrincipals,
  ): Promise<void> {
    const prepared = prepareConfigState(config);
    await this.db.transaction(async (tx) => {
      const now = Date.now();
      await Promise.all([
        tx
          .update(interfacePrincipalGrants)
          .set({ revokedAt: now, updatedAt: now })
          .where(isNull(interfacePrincipalGrants.revokedAt)),
        tx
          .update(interfaceAnchorBindings)
          .set({ revokedAt: now, updatedAt: now })
          .where(isNull(interfaceAnchorBindings.revokedAt)),
      ]);
      await insertPreparedState(tx, prepared, now);
      await tx
        .insert(authAccessSeedState)
        .values({ id: "config", seededAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: authAccessSeedState.id,
          set: { updatedAt: now },
        });
    });
  }

  async resolve(
    interfaceType: string,
    subject: string,
  ): Promise<ResolvedInterfacePrincipal | undefined> {
    const normalizedInterface = interfaceType.trim().toLowerCase();
    const principalKeyHash = hashInterfacePrincipal(interfaceType, subject);
    const [grants, anchors] = await Promise.all([
      this.db
        .select({ permissionLevel: interfacePrincipalGrants.permissionLevel })
        .from(interfacePrincipalGrants)
        .where(
          and(
            eq(interfacePrincipalGrants.interfaceType, normalizedInterface),
            eq(interfacePrincipalGrants.principalKeyHash, principalKeyHash),
            isNull(interfacePrincipalGrants.revokedAt),
          ),
        )
        .limit(1),
      this.db
        .select({ id: interfaceAnchorBindings.id })
        .from(interfaceAnchorBindings)
        .where(
          and(
            eq(interfaceAnchorBindings.interfaceType, normalizedInterface),
            eq(interfaceAnchorBindings.principalKeyHash, principalKeyHash),
            isNull(interfaceAnchorBindings.revokedAt),
          ),
        )
        .limit(1),
    ]);
    const grant = grants[0];
    const isAnchor = anchors.length > 0;
    if (!grant && !isAnchor) return undefined;
    return {
      permissionLevel: grant?.permissionLevel ?? "public",
      isAnchor,
    };
  }

  async listActiveState(): Promise<RuntimeInterfacePrincipalState> {
    const [grants, anchors] = await Promise.all([
      this.db
        .select({
          interfaceType: interfacePrincipalGrants.interfaceType,
          principalKeyHash: interfacePrincipalGrants.principalKeyHash,
          permissionLevel: interfacePrincipalGrants.permissionLevel,
        })
        .from(interfacePrincipalGrants)
        .where(isNull(interfacePrincipalGrants.revokedAt))
        .orderBy(
          interfacePrincipalGrants.interfaceType,
          interfacePrincipalGrants.principalKeyHash,
        ),
      this.db
        .select({
          interfaceType: interfaceAnchorBindings.interfaceType,
          principalKeyHash: interfaceAnchorBindings.principalKeyHash,
        })
        .from(interfaceAnchorBindings)
        .where(isNull(interfaceAnchorBindings.revokedAt))
        .orderBy(
          interfaceAnchorBindings.interfaceType,
          interfaceAnchorBindings.principalKeyHash,
        ),
    ]);
    return { grants, anchors };
  }
}

function prepareConfigState(
  config: ConfiguredInterfacePrincipals,
): PreparedPrincipalState {
  const grants = new Map<
    string,
    RuntimeInterfacePrincipalState["grants"][number]
  >();
  const addGrant = (
    configured: string,
    permissionLevel: "admin" | "trusted",
  ): void => {
    const principal = parseConfiguredInterfacePrincipal(configured);
    const principalKeyHash = hashInterfacePrincipal(
      principal.interfaceType,
      principal.subject,
    );
    grants.set(`${principal.interfaceType}:${principalKeyHash}`, {
      interfaceType: principal.interfaceType,
      principalKeyHash,
      permissionLevel,
    });
  };
  for (const principal of config.trusted) addGrant(principal, "trusted");
  for (const principal of config.admins) addGrant(principal, "admin");

  const anchors = new Map<
    string,
    RuntimeInterfacePrincipalState["anchors"][number]
  >();
  for (const configured of config.anchors) {
    const principal = parseConfiguredInterfacePrincipal(configured);
    const principalKeyHash = hashInterfacePrincipal(
      principal.interfaceType,
      principal.subject,
    );
    anchors.set(`${principal.interfaceType}:${principalKeyHash}`, {
      interfaceType: principal.interfaceType,
      principalKeyHash,
    });
  }
  return {
    grants: Array.from(grants.values()),
    anchors: Array.from(anchors.values()),
  };
}

type PrincipalTransaction = Parameters<
  Parameters<AuthRuntimeDB["transaction"]>[0]
>[0];

async function insertPreparedState(
  tx: PrincipalTransaction,
  state: PreparedPrincipalState,
  now: number,
): Promise<void> {
  if (state.grants.length > 0) {
    await tx.insert(interfacePrincipalGrants).values(
      state.grants.map((grant) => ({
        id: createPrefixedId("ipg"),
        ...grant,
        label: `Configured ${grant.interfaceType} principal`,
        source: "config" as const,
        createdAt: now,
        updatedAt: now,
        revokedAt: null,
      })),
    );
  }
  if (state.anchors.length > 0) {
    await tx.insert(interfaceAnchorBindings).values(
      state.anchors.map((anchor) => ({
        id: createPrefixedId("iab"),
        ...anchor,
        source: "config" as const,
        createdAt: now,
        updatedAt: now,
        revokedAt: null,
      })),
    );
  }
}
