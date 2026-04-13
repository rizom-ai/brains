import { lookup } from "node:dns/promises";

import type { FetchLike } from "@brains/utils/origin-ca";

import type { ObservedUserStatus, ResolvedUserIdentity } from "./load-registry";

export interface LookupResult {
  address: string;
  family: number;
}

export type LookupHost = (hostname: string) => Promise<LookupResult>;

export interface CreateObservedStatusResolverOptions {
  fetchImpl?: FetchLike;
  lookupHost?: LookupHost;
}

export function createObservedStatusResolver(
  options: CreateObservedStatusResolverOptions = {},
): (user: ResolvedUserIdentity) => Promise<ObservedUserStatus> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookupHost = options.lookupHost ?? lookup;

  return async function resolveStatus(
    user: ResolvedUserIdentity,
  ): Promise<ObservedUserStatus> {
    const dnsStatus = await probeDns(user.domain, lookupHost);
    const serverStatus = await probeHealth(user.domain, fetchImpl);
    const mcpStatus = await probeMcpAuthGate(user.domain, fetchImpl);

    return {
      dnsStatus,
      serverStatus,
      deployStatus: serverStatus,
      mcpStatus,
    };
  };
}

async function probeDns(
  hostname: string,
  lookupHost: LookupHost,
): Promise<"ready" | "failed"> {
  try {
    const result = await lookupHost(hostname);
    return result.address ? "ready" : "failed";
  } catch {
    return "failed";
  }
}

async function probeHealth(
  hostname: string,
  fetchImpl: FetchLike,
): Promise<"ready" | "failed"> {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `https://${hostname}/health`,
      {
        method: "GET",
      },
    );
    return response.ok ? "ready" : "failed";
  } catch {
    return "failed";
  }
}

async function probeMcpAuthGate(
  hostname: string,
  fetchImpl: FetchLike,
): Promise<"ready" | "failed"> {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `https://${hostname}/mcp`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {},
        }),
      },
    );

    return response.status === 401 || response.ok ? "ready" : "failed";
  } catch {
    return "failed";
  }
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  input: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
