import type { AtprotoPdsClientLike } from "@brains/atproto-contracts";
import type { FetchLike } from "@brains/utils/fetch-like";
import {
  assertSafePublicHttpsUrl,
  type ResolveHostname,
} from "@brains/utils/safe-public-fetch";
import { z } from "@brains/utils/zod";
import { listAllRecords, type ListedRecord } from "./list-records";
import { AtprotoPdsClient } from "./pds-client";

const handleResolutionResponseSchema = z.looseObject({
  did: z.string(),
});

const didDocumentServiceSchema = z.looseObject({
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

/**
 * A repo whose identity its directory reports deleted for good. Thrown
 * apart from a repo that merely could not be reached, so a reader can tell
 * an author who left from a directory that is failing.
 */
export class RepoGoneError extends Error {
  constructor(repoDid: string) {
    super(`AT Protocol repo is gone: ${repoDid}`);
    this.name = "RepoGoneError";
  }
}

const HTTP_GONE = 410;

export interface PublicRepoReaderOptions {
  /**
   * What every request goes through. Each address read is someone else's, so
   * a brain passes a safe public fetch (`createSafePublicFetch`).
   */
  fetch: FetchLike;
  /** The service asked which repo a handle names. */
  handleResolverEndpoint: string;
  /** How a hostname's addresses are found, for the public-address check. */
  resolveHostname?: ResolveHostname | undefined;
  requestTimeoutMs?: number | undefined;
  /** The client for a PDS, in place of the package's own. */
  createPdsClient?: ((pdsEndpoint: string) => AtprotoPdsClientLike) | undefined;
}

/** Someone else's repo, open for reading: no session, no credentials. */
export interface PublicRepo {
  readonly repoDid: string;
  readonly pdsEndpoint: string;
  getRecord(input: { collection: string; rkey: string }): Promise<ListedRecord>;
  /** Every record of a collection, read `pageSize` at a time. */
  listRecords(
    collection: string,
    options?: { pageSize?: number | undefined },
  ): Promise<ListedRecord[]>;
}

/**
 * The read path to another brain's public repo: a handle or DID resolved to
 * its PDS, the PDS checked to be a public HTTPS address, and its records read
 * without signing in.
 */
export class PublicRepoReader {
  private readonly options: PublicRepoReaderOptions;

  constructor(options: PublicRepoReaderOptions) {
    this.options = options;
  }

  /** Resolve a repo and open it; refused when its PDS is not a public address. */
  async open(repo: string): Promise<PublicRepo> {
    const { repoDid, pdsEndpoint } = await this.resolveRepoPdsEndpoint(repo);
    await assertSafePublicHttpsUrl(pdsEndpoint, this.options.resolveHostname);
    const client = this.createPdsClient(pdsEndpoint);
    return {
      repoDid,
      pdsEndpoint,
      getRecord: async ({ collection, rkey }): Promise<ListedRecord> => {
        if (!client.getRecord) {
          throw new Error(
            "AT Protocol PDS client does not support record reads",
          );
        }
        return client.getRecord({ repo: repoDid, collection, rkey });
      },
      listRecords: async (
        collection,
        options = {},
      ): Promise<ListedRecord[]> => {
        if (!client.listRecords) {
          throw new Error(
            "AT Protocol PDS client does not support record listing",
          );
        }
        return listAllRecords(client.listRecords.bind(client), {
          repo: repoDid,
          collection,
          pageSize: options.pageSize,
        });
      },
    };
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
      this.options.handleResolverEndpoint,
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
      ? await this.fetchPlcDocument(did)
      : did.startsWith("did:web:")
        ? await this.fetchJson(didWebDocumentUrl(did))
        : undefined;
    const parsed = didDocumentServiceSchema.safeParse(didDocument);
    if (!parsed.success) return undefined;

    const pdsService = parsed.data.service?.find(
      (service) =>
        service.id === "#atproto_pds" ||
        service.type === "AtprotoPersonalDataServer",
    );
    return pdsService?.serviceEndpoint;
  }

  private createPdsClient(pdsEndpoint: string): AtprotoPdsClientLike {
    if (this.options.createPdsClient) {
      return this.options.createPdsClient(pdsEndpoint);
    }
    // Reads need no session, so the client is given nothing to sign in with.
    return new AtprotoPdsClient({
      pdsEndpoint,
      identifier: "",
      appPassword: "",
      fetch: this.options.fetch,
      ...(this.options.requestTimeoutMs !== undefined && {
        requestTimeoutMs: this.options.requestTimeoutMs,
      }),
    });
  }

  /** A `did:plc` identity's document; a tombstoned identity is gone. */
  private async fetchPlcDocument(did: string): Promise<unknown> {
    const response = await this.options.fetch(
      `https://plc.directory/${encodeURIComponent(did)}`,
    );
    if (response.status === HTTP_GONE) throw new RepoGoneError(did);
    if (!response.ok) return undefined;
    return response.json();
  }

  private async fetchJson(url: string): Promise<unknown> {
    const response = await this.options.fetch(url);
    if (!response.ok) return undefined;
    return response.json();
  }
}

/** Where a `did:web` DID's document is served. */
export function didWebDocumentUrl(did: string): string {
  const parts = did.slice("did:web:".length).split(":").map(decodeURIComponent);
  const [host, ...pathParts] = parts;
  if (!host) throw new Error(`Invalid did:web value: ${did}`);
  if (pathParts.length === 0) return `https://${host}/.well-known/did.json`;
  return `https://${host}/${pathParts.join("/")}/did.json`;
}
