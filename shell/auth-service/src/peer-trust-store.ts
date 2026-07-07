import { join } from "node:path";
import { z } from "@brains/utils/zod";
import { JsonFileStore } from "./json-file-store";

const PEER_TRUST_FILE = "a2a-peer-trust.json";

const peerTrustRecordSchema = z
  .object({
    domain: z.string().min(1),
    keyFingerprint: z.string().min(1),
    grantedLevel: z.enum(["public", "trusted"]),
  })
  .strict();

const peerTrustStoreFileSchema = z
  .object({
    peers: z.array(peerTrustRecordSchema),
  })
  .strict();

export type A2APeerTrustRecord = z.infer<typeof peerTrustRecordSchema>;

export interface GrantA2APeerTrustInput {
  domain: string;
  keyFingerprint: string;
  grantedLevel: "public" | "trusted" | "anchor";
}

export interface A2APeerTrustStoreOptions {
  storageDir: string;
  fileName?: string;
}

export class A2APeerTrustStore {
  private readonly store: JsonFileStore<
    z.infer<typeof peerTrustStoreFileSchema>
  >;

  constructor(options: A2APeerTrustStoreOptions) {
    this.store = new JsonFileStore({
      filePath: join(options.storageDir, options.fileName ?? PEER_TRUST_FILE),
      parse: (value): z.infer<typeof peerTrustStoreFileSchema> =>
        peerTrustStoreFileSchema.parse(value),
      empty: (): z.infer<typeof peerTrustStoreFileSchema> => ({ peers: [] }),
      onCorrupt: "throw",
    });
  }

  async get(domain: string): Promise<A2APeerTrustRecord | undefined> {
    const normalizedDomain = normalizePeerDomain(domain);
    const file = await this.store.read();
    return file.peers.find((peer) => peer.domain === normalizedDomain);
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
