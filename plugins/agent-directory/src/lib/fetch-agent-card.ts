import { z } from "@brains/utils";

const ANCHOR_EXTENSION_URI = "https://rizom.ai/ext/anchor-profile/v1";

const skillSchema = z
  .object({
    id: z.string(),
    description: z.string(),
    name: z.string().optional(),
    tags: z.array(z.string()).optional().default([]),
  })
  .passthrough();

const anchorParamsSchema = z.object({
  name: z.string(),
  kind: z.enum(["professional", "team", "collective"]).optional(),
  organization: z.string().optional(),
  description: z.string().optional(),
});

const extensionSchema = z
  .object({
    uri: z.string(),
    params: z.record(z.unknown()).optional(),
  })
  .passthrough();

const agentCardSchema = z
  .object({
    name: z.string(),
    url: z.string(),
    description: z.string().optional(),
    skills: z.array(skillSchema).optional().default([]),
    capabilities: z
      .object({
        extensions: z.array(extensionSchema).optional().default([]),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export interface FetchedAgentCard {
  brainName: string;
  url: string;
  description: string;
  skills: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
  }>;
  anchor: {
    name: string;
    kind?: "professional" | "team" | "collective" | undefined;
    organization?: string | undefined;
    description?: string | undefined;
  } | null;
}

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
): Promise<FetchedAgentCard | null> {
  const baseUrl = domain.startsWith("http") ? domain : `https://${domain}`;
  const cardUrl = `${baseUrl.replace(/\/$/, "")}/.well-known/agent-card.json`;

  try {
    const response = await fetchFn(cardUrl);
    if (!response.ok) return null;

    const data: unknown = await response.json();
    const parsed = agentCardSchema.safeParse(data);
    if (!parsed.success) return null;

    const card = parsed.data;

    // Extract anchor-profile extension
    const extensions = card.capabilities?.extensions ?? [];
    const anchorExt = extensions.find((e) => e.uri === ANCHOR_EXTENSION_URI);

    let anchor: FetchedAgentCard["anchor"] = null;
    if (anchorExt?.params) {
      const anchorParsed = anchorParamsSchema.safeParse(anchorExt.params);
      if (anchorParsed.success) {
        anchor = anchorParsed.data;
      }
    }

    return {
      brainName: card.name,
      url: card.url,
      description: card.description ?? "",
      skills: card.skills.map((s) => ({
        id: s.id,
        name: s.name ?? s.id,
        description: s.description,
        tags: s.tags ?? [],
      })),
      anchor,
    };
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
