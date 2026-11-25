import type { FetchLike } from "@brains/utils/fetch-like";
import { z } from "@brains/utils/zod";
import type {
  AtprotoBrainCardRecord,
  AtprotoPdsClientLike,
} from "@brains/atproto-contracts";
import { didWebDocumentUrl, PublicRepoReader } from "@brains/atproto-client";
import type { ResolveHostname } from "@brains/utils/safe-public-fetch";

/**
 * A candidate brain card that fails an identity check is rejected, not
 * retried: the record itself is wrong rather than the network. Callers
 * distinguish this from a transport error to decide whether to back off.
 */
export class DiscoveryRejectionError extends Error {}

const didDocumentSchema = z.looseObject({
  id: z.string().optional(),
  alsoKnownAs: z.array(z.string()).optional(),
  service: z
    .array(
      z.looseObject({
        id: z.string().optional(),
        type: z.string().optional(),
        serviceEndpoint: z.string().optional(),
      }),
    )
    .optional(),
});

export interface AtprotoIdentityResolverOptions {
  /** Safe public fetch — discovery reads only attacker-supplied URLs. */
  fetch: FetchLike;
  /** Endpoint used to resolve handles that are not already DIDs. */
  pdsEndpoint: string;
  identifier: string;
  appPassword: string;
  requestTimeoutMs: number;
  resolveHostname?: ResolveHostname | undefined;
  createPdsClient?:
    | ((config: {
        pdsEndpoint: string;
        identifier: string;
        appPassword: string;
        fetch?: FetchLike | undefined;
      }) => AtprotoPdsClientLike)
    | undefined;
}

/**
 * Identity during discovery: the read path to a candidate's repo, and the
 * binding between a brain card's site, its `did:web`, and the repo it was
 * found in.
 */
export class AtprotoIdentityResolver {
  private readonly options: AtprotoIdentityResolverOptions;
  /** The read path to a candidate's repo, on the safe fetch. */
  readonly repos: PublicRepoReader;

  constructor(options: AtprotoIdentityResolverOptions) {
    this.options = options;
    const { createPdsClient, identifier, appPassword, fetch } = options;
    this.repos = new PublicRepoReader({
      fetch,
      handleResolverEndpoint: options.pdsEndpoint,
      resolveHostname: options.resolveHostname,
      requestTimeoutMs: options.requestTimeoutMs,
      ...(createPdsClient && {
        createPdsClient: (pdsEndpoint: string): AtprotoPdsClientLike =>
          createPdsClient({ pdsEndpoint, identifier, appPassword, fetch }),
      }),
    });
  }

  /**
   * Prove the card's brain owns the repo it was published to. Federation-only
   * cards use the repo DID directly. Web-channel cards bind their site through
   * a `did:web` document that claims the repo back.
   */
  async verifyBrainCardIdentity(
    repoDid: string,
    record: AtprotoBrainCardRecord,
  ): Promise<void> {
    if (!record.siteUrl) {
      if (record.brain.did !== repoDid) {
        throw new DiscoveryRejectionError(
          "Headless brain card brain DID must match its repo DID",
        );
      }
      return;
    }

    let siteUrl: URL;
    try {
      siteUrl = new URL(record.siteUrl);
    } catch {
      throw new DiscoveryRejectionError("Brain card siteUrl is invalid");
    }
    if (siteUrl.protocol !== "https:") {
      throw new DiscoveryRejectionError("Brain card siteUrl must use HTTPS");
    }

    const brainDid = record.brain.did;
    if (!brainDid.startsWith("did:web:")) {
      throw new DiscoveryRejectionError("Brain card brain DID must be did:web");
    }
    const didHostname = didWebHostname(brainDid);
    if (siteUrl.hostname.toLowerCase() !== didHostname.toLowerCase()) {
      throw new DiscoveryRejectionError(
        "Brain card siteUrl and did:web hostname do not match",
      );
    }

    const response = await this.options.fetch(didWebDocumentUrl(brainDid));
    if (!response.ok) {
      const message = `Brain did:web document returned HTTP ${String(response.status)}`;
      // 5xx is the remote's problem and worth retrying; 4xx is the card's.
      if (response.status >= 500) throw new Error(message);
      throw new DiscoveryRejectionError(message);
    }
    const parsed = didDocumentSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.id !== brainDid) {
      throw new DiscoveryRejectionError(
        "Brain did:web document does not identify itself correctly",
      );
    }

    for (const alias of parsed.data.alsoKnownAs ?? []) {
      if (!alias.startsWith("at://")) continue;
      const identifier = alias.slice("at://".length).replace(/\/$/, "");
      if (identifier === repoDid) return;
      if (!identifier.startsWith("did:")) {
        const resolved = await this.repos.resolveHandleToDid(identifier);
        if (resolved === repoDid) return;
      }
    }
    throw new DiscoveryRejectionError(
      "Brain did:web document is not bound to the candidate repo DID",
    );
  }
}

export function didWebHostname(did: string): string {
  const [host] = did.slice("did:web:".length).split(":");
  if (!host) throw new DiscoveryRejectionError(`Invalid did:web value: ${did}`);
  return decodeURIComponent(host);
}
