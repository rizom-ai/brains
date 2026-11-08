import type { FetchLike } from "@brains/utils/fetch-like";
import { parseAgentCard, type ParsedAgentCard } from "./agent-card-schema";

/** How long one Agent Card fetch may take, response and body together. */
export const DEFAULT_AGENT_CARD_TIMEOUT_MS = 30_000;

/** Why a host's Agent Card was not accepted. */
export type AgentCardRefusalReason =
  /** The requested host is not a bare host such as `example.com`. */
  | "invalid_host"
  /** The card could not be fetched: network failure or a non-OK status. */
  | "unavailable"
  /** The card did not arrive within the timeout. */
  | "timeout"
  /** The host answered with something that is not an Agent Card. */
  | "invalid_card"
  /** The card's endpoint is not a URL, or not HTTPS. */
  | "untrusted_endpoint"
  /** The card's endpoint is on a different host than the one asked. */
  | "host_mismatch";

export type VerifiedAgentCard =
  | { ok: true; card: ParsedAgentCard }
  | { ok: false; reason: AgentCardRefusalReason; error: string };

/**
 * Whether a card was refused for where it points rather than for being
 * missing. Its error names the hosts, so it can reach the caller as is.
 */
export function isEndpointRefusal(reason: AgentCardRefusalReason): boolean {
  return reason === "untrusted_endpoint" || reason === "host_mismatch";
}

export interface FetchVerifiedAgentCardOptions {
  fetch: FetchLike;
  /** Defaults to {@link DEFAULT_AGENT_CARD_TIMEOUT_MS}. */
  timeoutMs?: number | undefined;
  /** Caller cancellation: aborting rejects with the signal's reason. */
  signal?: AbortSignal | undefined;
}

type CardRead =
  | { kind: "card"; data: unknown }
  | { kind: "status"; status: number }
  | { kind: "not_json" };

/** `https://<host>`, or null when `host` carries a scheme, path, or credentials. */
function agentOrigin(host: string): URL | null {
  if (!/^[^\s/?#@\\]+$/.test(host)) return null;
  try {
    return new URL(`https://${host}`);
  } catch {
    return null;
  }
}

async function readCard(
  fetchFn: FetchLike,
  cardUrl: string,
  signal: AbortSignal,
): Promise<CardRead> {
  const response = await fetchFn(cardUrl, { signal });
  if (!response.ok) return { kind: "status", status: response.status };
  const text = await response.text();
  try {
    return { kind: "card", data: JSON.parse(text) };
  } catch {
    return { kind: "not_json" };
  }
}

/** Settle with `operation`, or reject with the signal's reason once it aborts. */
function settleOnAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason);
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function refuse(
  reason: AgentCardRefusalReason,
  error: string,
): VerifiedAgentCard {
  return { ok: false, reason, error };
}

/**
 * Fetch `https://<host>/.well-known/agent-card.json` and accept the card only
 * when its endpoint is HTTPS on that same host. An agent is known by the host
 * its card is served from; a card naming another host is refused, so neither
 * a call nor a saved contact can be redirected elsewhere.
 *
 * Expected refusals come back as `{ ok: false }`; only the caller's own
 * cancellation rejects.
 */
export async function fetchVerifiedAgentCard(
  host: string,
  options: FetchVerifiedAgentCardOptions,
): Promise<VerifiedAgentCard> {
  const callerSignal = options.signal;
  callerSignal?.throwIfAborted();

  const origin = agentOrigin(host);
  if (!origin) {
    return refuse(
      "invalid_host",
      `${host || "An empty host"} is not an agent host. Use a bare domain such as example.com.`,
    );
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_AGENT_CARD_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(Math.max(0, timeoutMs));
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeout])
    : timeout;
  const source = origin.origin;

  let read: CardRead;
  try {
    read = await settleOnAbort(
      readCard(options.fetch, `${source}/.well-known/agent-card.json`, signal),
      signal,
    );
  } catch {
    if (callerSignal?.aborted) throw callerSignal.reason;
    if (timeout.aborted) {
      return refuse(
        "timeout",
        `Agent Card from ${source} did not arrive within ${timeoutMs} ms.`,
      );
    }
    return refuse(
      "unavailable",
      `Could not fetch an Agent Card from ${source}.`,
    );
  }

  if (read.kind === "status") {
    return refuse(
      "unavailable",
      `Could not fetch an Agent Card from ${source} (HTTP ${read.status}).`,
    );
  }
  const card = read.kind === "card" ? parseAgentCard(read.data) : null;
  if (!card) {
    return refuse("invalid_card", `${source} serves no valid A2A Agent Card.`);
  }

  let endpoint: URL;
  try {
    endpoint = new URL(card.url);
  } catch {
    return refuse(
      "untrusted_endpoint",
      `Agent Card for ${host} has an invalid endpoint URL.`,
    );
  }
  if (endpoint.protocol !== "https:") {
    return refuse(
      "untrusted_endpoint",
      `Agent Card for ${host} has an untrusted endpoint URL (${card.url}). The endpoint must be https:// on ${host}.`,
    );
  }
  if (endpoint.hostname !== origin.hostname) {
    return refuse(
      "host_mismatch",
      `Agent Card for ${host} has an endpoint URL on another host, ${endpoint.hostname} (${card.url}). The endpoint must be https:// on ${host}.`,
    );
  }

  return { ok: true, card };
}
