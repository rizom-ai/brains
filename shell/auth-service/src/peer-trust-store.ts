import { join } from "node:path";
import { z } from "@brains/utils/zod";
import { eq } from "drizzle-orm";
import { AuthAuditStore } from "./audit-store";
import { JsonFileStore } from "./json-file-store";
import type { AuthRuntimeDatabase } from "./runtime-db";
import { a2aPeerTrust } from "./runtime-schema";

const PEER_TRUST_FILE = "a2a-peer-trust.json";

export interface A2APeerTrustRecord {
  domain: string;
  keyFingerprint: string;
  grantedLevel: "public" | "trusted";
}

interface A2APeerTrustStoreFile {
  peers: A2APeerTrustRecord[];
}

const peerTrustRecordSchema: z.ZodType<A2APeerTrustRecord> = z
  .object({
    domain: z.string().min(1),
    keyFingerprint: z.string().min(1),
    grantedLevel: z.enum(["public", "trusted"]),
  })
  .strict();

const peerTrustStoreFileSchema: z.ZodType<A2APeerTrustStoreFile> = z
  .object({
    peers: z.array(peerTrustRecordSchema),
  })
  .strict();

export interface GrantA2APeerTrustInput {
  domain: string;
  keyFingerprint: string;
  grantedLevel: "public" | "trusted" | "anchor";
}

export interface PeerTrustMutationContext {
  actorUserId?: string;
}

export interface A2APeerTrustStoreOptions {
  storageDir: string;
  fileName?: string;
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

  async importPeer(record: A2APeerTrustRecord): Promise<boolean> {
    const now = Date.now();
    const inserted = await this.database.db
      .insert(a2aPeerTrust)
      .values({
        domain: normalizePeerDomain(record.domain),
        keyFingerprint: record.keyFingerprint,
        grantedLevel: record.grantedLevel,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ domain: a2aPeerTrust.domain });
    return inserted.length > 0;
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
    if (input.grantedLevel === "anchor") {
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

export class A2APeerTrustStore implements A2APeerTrustPersistence {
  private readonly store: JsonFileStore<A2APeerTrustStoreFile>;

  constructor(options: A2APeerTrustStoreOptions) {
    this.store = new JsonFileStore({
      filePath: join(options.storageDir, options.fileName ?? PEER_TRUST_FILE),
      parse: (value): A2APeerTrustStoreFile =>
        peerTrustStoreFileSchema.parse(value),
      empty: (): A2APeerTrustStoreFile => ({ peers: [] }),
      onCorrupt: "throw",
    });
  }

  async get(domain: string): Promise<A2APeerTrustRecord | undefined> {
    const normalizedDomain = normalizePeerDomain(domain);
    const file = await this.store.read();
    return file.peers.find((peer) => peer.domain === normalizedDomain);
  }

  async listPeers(): Promise<A2APeerTrustRecord[]> {
    return (await this.store.read()).peers;
  }

  async grant(input: GrantA2APeerTrustInput): Promise<A2APeerTrustRecord> {
    if (input.grantedLevel === "anchor") {
      throw new Error("A2A peer trust grants must be trusted or public");
    }

    const record: A2APeerTrustRecord = {
      domain: normalizePeerDomain(input.domain),
      keyFingerprint: input.keyFingerprint,
      grantedLevel: input.grantedLevel,
    };

    await this.store.enqueueWrite(async () => {
      const file = await this.store.read();
      const peers = file.peers.filter((peer) => peer.domain !== record.domain);
      await this.store.write({ peers: [...peers, record] });
    });

    return record;
  }

  async revoke(domain: string): Promise<void> {
    const normalizedDomain = normalizePeerDomain(domain);
    await this.store.enqueueWrite(async () => {
      const file = await this.store.read();
      await this.store.write({
        peers: file.peers.filter((peer) => peer.domain !== normalizedDomain),
      });
    });
  }
}

function normalizePeerDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed || trimmed.includes(":") || trimmed.includes("/")) {
    throw new Error("A2A peer trust domain must be a bare domain");
  }
  return trimmed;
}
