import { lookup } from "node:dns/promises";

import type { FetchLike } from "@brains/deploy-support/origin-ca";

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
    const [serverStatus, deployStatus, mcpStatus] = await Promise.all([
      probeHealth(user.domain, "/health/ready", fetchImpl),
      probeHealth(user.domain, "/health/operate", fetchImpl),
      probeMcpAuthGate(user.domain, fetchImpl),
    ]);

    return {
      dnsStatus,
      serverStatus,
      deployStatus,
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
  path: "/health/ready" | "/health/operate",
  fetchImpl: FetchLike,
): Promise<"ready" | "failed"> {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `https://${hostname}${path}`,
      {
        method: "GET",
      },
    );
    return response.ok ? "ready" : "failed";
  } catch {
    // A probe: unreachable is indistinguishable from unhealthy for this
    // caller, and both are reported as failed.
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
    // Same probe contract as above: unreachable and unhealthy both report
    // failed, because neither means the gate is serving.
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
