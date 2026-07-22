import { eq } from "drizzle-orm";
import { AuthAuditStore } from "./audit-store";
import type { AuthRuntimeDatabase } from "./runtime-db";
import { a2aPeerTrust } from "./runtime-schema";

export interface A2APeerTrustRecord {
  domain: string;
  keyFingerprint: string;
  grantedLevel: "public" | "trusted";
}

export interface GrantA2APeerTrustInput {
  domain: string;
  keyFingerprint: string;
  grantedLevel: "public" | "trusted" | "admin";
}

export interface PeerTrustMutationContext {
  actorUserId?: string;
}

export interface A2APeerTrustPersistence {
  get(domain: string): Promise<A2APeerTrustRecord | undefined>;
  grant(
    input: GrantA2APeerTrustInput,
    context?: PeerTrustMutationContext,
  ): Promise<A2APeerTrustRecord>;
  revoke(domain: string, context?: PeerTrustMutationContext): Promise<void>;
}

export class RuntimeA2APeerTrustStore implements A2APeerTrustPersistence {
  private readonly database: AuthRuntimeDatabase;

  constructor(database: AuthRuntimeDatabase) {
    this.database = database;
  }

  async get(domain: string): Promise<A2APeerTrustRecord | undefined> {
    const [row] = await this.database.db
      .select()
      .from(a2aPeerTrust)
      .where(eq(a2aPeerTrust.domain, normalizePeerDomain(domain)))
      .limit(1);
    return row
      ? {
          domain: row.domain,
          keyFingerprint: row.keyFingerprint,
          grantedLevel: row.grantedLevel,
        }
      : undefined;
  }

  async grant(
    input: GrantA2APeerTrustInput,
    context: PeerTrustMutationContext = {},
  ): Promise<A2APeerTrustRecord> {
    if (input.grantedLevel === "admin") {
      throw new Error("A2A peer trust grants must be trusted or public");
    }
    const record: A2APeerTrustRecord = {
      domain: normalizePeerDomain(input.domain),
      keyFingerprint: input.keyFingerprint,
      grantedLevel: input.grantedLevel,
    };
    const now = Date.now();
    await this.database.db
      .insert(a2aPeerTrust)
      .values({
        domain: record.domain,
        keyFingerprint: record.keyFingerprint,
        grantedLevel: record.grantedLevel,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: a2aPeerTrust.domain,
        set: {
          keyFingerprint: record.keyFingerprint,
          grantedLevel: record.grantedLevel,
          updatedAt: now,
        },
      });
    await new AuthAuditStore(this.database.db).append({
      ...(context.actorUserId ? { actorUserId: context.actorUserId } : {}),
      action: "auth.a2a_peer_trust.granted",
      targetType: "a2a_peer",
      targetId: record.domain,
      metadata: {
        keyFingerprint: record.keyFingerprint,
        grantedLevel: record.grantedLevel,
      },
    });
    return record;
  }

  async revoke(
    domain: string,
    context: PeerTrustMutationContext = {},
  ): Promise<void> {
    const normalizedDomain = normalizePeerDomain(domain);
    const deleted = await this.database.db
      .delete(a2aPeerTrust)
      .where(eq(a2aPeerTrust.domain, normalizedDomain))
      .returning({ domain: a2aPeerTrust.domain });
    if (deleted.length > 0) {
      await new AuthAuditStore(this.database.db).append({
        ...(context.actorUserId ? { actorUserId: context.actorUserId } : {}),
        action: "auth.a2a_peer_trust.revoked",
        targetType: "a2a_peer",
        targetId: normalizedDomain,
      });
    }
  }
}

function normalizePeerDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed || trimmed.includes(":") || trimmed.includes("/")) {
    throw new Error("A2A peer trust domain must be a bare domain");
  }
  return trimmed;
}
