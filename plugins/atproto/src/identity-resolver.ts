import type { FetchLike } from "@brains/utils/fetch-like";
import { z } from "@brains/utils/zod";
import type {
  AtprotoBrainCardRecord,
  AtprotoPdsClientLike,
} from "@brains/atproto-contracts";
import { AtprotoPdsClient } from "./pds-client";

/**
 * A candidate brain card that fails an identity check is rejected, not
 * retried: the record itself is wrong rather than the network. Callers
 * distinguish this from a transport error to decide whether to back off.
 */
export class DiscoveryRejectionError extends Error {}

const handleResolutionResponseSchema = z.looseObject({
  did: z.string(),
});

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
 * Resolves AT Protocol identities during discovery: handle → DID, DID → PDS,
 * and the binding between a brain card's site, its `did:web`, and the repo it
 * was found in.
 */
export class AtprotoIdentityResolver {
  private readonly options: AtprotoIdentityResolverOptions;

  constructor(options: AtprotoIdentityResolverOptions) {
    this.options = options;
  }

  /** A read-only client for someone else's PDS, on the safe fetch path. */
  createPublicPdsClient(pdsEndpoint: string): AtprotoPdsClientLike {
    const { createPdsClient, identifier, appPassword, fetch } = this.options;
    if (createPdsClient) {
      return createPdsClient({
        pdsEndpoint,
        identifier,
        appPassword,
        fetch,
      });
    }

    return new AtprotoPdsClient({
      pdsEndpoint,
      identifier,
      appPassword,
      fetch,
      requestTimeoutMs: this.options.requestTimeoutMs,
    });
  }

  async resolveRepoPdsEndpoint(repo: string): Promise<{
    repoDid: string;
    pdsEndpoint: string;
  }> {
    const repoDid = repo.startsWith("did:")
      ? repo
      : await this.resolveHandleToDid(repo);
    if (!repoDid) {
      throw new Error(`Could not resolve AT Protocol repo: ${repo}`);
    }
    const pdsEndpoint = await this.resolveDidToPdsEndpoint(repoDid);
    if (!pdsEndpoint) {
      throw new Error(`Could not resolve AT Protocol PDS for repo: ${repoDid}`);
    }
    return { repoDid, pdsEndpoint };
  }

  async resolveHandleToDid(handle: string): Promise<string | undefined> {
    const url = new URL(
      "/xrpc/com.atproto.identity.resolveHandle",
      this.options.pdsEndpoint,
    );
    url.searchParams.set("handle", handle);
    const response = await this.options.fetch(url.toString());
    if (!response.ok) return undefined;
    const body = handleResolutionResponseSchema.safeParse(
      await response.json(),
    );
    return body.success ? body.data.did : undefined;
  }

  async resolveDidToPdsEndpoint(did: string): Promise<string | undefined> {
    const didDocument = did.startsWith("did:plc:")
      ? await this.fetchJson(`https://plc.directory/${encodeURIComponent(did)}`)
      : did.startsWith("did:web:")
        ? await this.fetchJson(didWebDocumentUrl(did))
        : undefined;
    const parsed = didDocumentSchema.safeParse(didDocument);
    if (!parsed.success) return undefined;

    const pdsService = parsed.data.service?.find(
      (service) =>
        service.id === "#atproto_pds" ||
        service.type === "AtprotoPersonalDataServer",
    );
    return pdsService?.serviceEndpoint;
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
        const resolved = await this.resolveHandleToDid(identifier);
        if (resolved === repoDid) return;
      }
    }
    throw new DiscoveryRejectionError(
      "Brain did:web document is not bound to the candidate repo DID",
    );
  }

  private async fetchJson(url: string): Promise<unknown> {
    const response = await this.options.fetch(url);
    if (!response.ok) return undefined;
    return response.json();
  }
}

export function didWebHostname(did: string): string {
  const [host] = did.slice("did:web:".length).split(":");
  if (!host) throw new DiscoveryRejectionError(`Invalid did:web value: ${did}`);
  return decodeURIComponent(host);
}

export function didWebDocumentUrl(did: string): string {
  const parts = did.slice("did:web:".length).split(":").map(decodeURIComponent);
  const [host, ...pathParts] = parts;
  if (!host) throw new Error(`Invalid did:web value: ${did}`);
  if (pathParts.length === 0) return `https://${host}/.well-known/did.json`;
  return `https://${host}/${pathParts.join("/")}/did.json`;
}
