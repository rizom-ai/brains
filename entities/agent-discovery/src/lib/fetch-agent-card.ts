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
 * Extract domain from a URL, bare domain, or natural language containing a URL.
 * Returns empty string if no domain can be found.
 */
export function extractDomain(input: string): string {
  const trimmed = input.trim();

  // Direct URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      return new URL(trimmed).hostname;
    } catch {
      return trimmed;
    }
  }

  // URL embedded in natural language (strip trailing punctuation)
  const urlMatch = trimmed.match(/https?:\/\/[^\s]+?(?=[.,;:!?)]*(?:\s|$))/);
  if (urlMatch) {
    try {
      return new URL(urlMatch[0]).hostname;
    } catch {
      return urlMatch[0];
    }
  }

  // Bare domain (contains a dot, no spaces)
  if (/^[^\s]+\.[^\s]+$/.test(trimmed)) {
    return trimmed;
  }

  return "";
}
