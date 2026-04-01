import { parseAgentCard, type ParsedAgentCard } from "@brains/plugins";

export type { ParsedAgentCard };

export type FetchFn = (
  url: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Fetch and parse an Agent Card, including the anchor-profile extension.
 * Returns null if the card is unreachable or unparseable.
 */
export async function fetchAgentCard(
  domain: string,
  fetchFn: FetchFn,
): Promise<ParsedAgentCard | null> {
  const baseUrl = domain.startsWith("http") ? domain : `https://${domain}`;
  const cardUrl = `${baseUrl.replace(/\/$/, "")}/.well-known/agent-card.json`;

  try {
    const response = await fetchFn(cardUrl);
    if (!response.ok) return null;

    const data: unknown = await response.json();
    return parseAgentCard(data);
  } catch {
    return null;
  }
}

/**
 * Extract domain from a URL or return as-is if already a domain.
 */
export function extractDomain(input: string): string {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    try {
      return new URL(input).hostname;
    } catch {
      return input;
    }
  }
  return input;
}
