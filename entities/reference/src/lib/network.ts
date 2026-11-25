import { PublicRepoReader } from "@brains/atproto-client";
import type { FetchLike } from "@brains/utils/fetch-like";
import {
  createSafePublicFetch,
  type ResolveHostname,
} from "@brains/utils/safe-public-fetch";

/**
 * How references reach other brains: the fetch their record reads go
 * through, the hostname resolver the public-address guard checks with, and
 * the service asked which repo a handle names. The globals unless a test
 * injects its own.
 */
export interface ReferenceNetwork {
  readonly fetch?: FetchLike | undefined;
  readonly resolveHostname?: ResolveHostname | undefined;
  readonly handleResolverEndpoint?: string | undefined;
}

const DEFAULT_HANDLE_RESOLVER = "https://bsky.social";
const REQUEST_TIMEOUT_MS = 10_000;
// A page of post records carries their bodies, which are read past and
// never kept; the cap bounds what one page may send.
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** The read path to an author's repo: every request on the safe public fetch. */
export function referenceRepos(network: ReferenceNetwork): PublicRepoReader {
  return new PublicRepoReader({
    fetch: createSafePublicFetch({
      fetchFn: network.fetch,
      resolveHostname: network.resolveHostname,
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxResponseBytes: MAX_RESPONSE_BYTES,
      maxRedirects: 3,
    }),
    handleResolverEndpoint:
      network.handleResolverEndpoint ?? DEFAULT_HANDLE_RESOLVER,
    resolveHostname: network.resolveHostname,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
  });
}
