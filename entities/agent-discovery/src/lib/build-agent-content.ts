import { slugifyUrl } from "@brains/utils";
import { AgentAdapter } from "../adapters/agent-adapter";
import type { ParsedAgentCard } from "./fetch-agent-card";

const agentAdapter = new AgentAdapter();

/**
 * Build agent entity content and metadata from a parsed Agent Card.
 * Shared between manual add flows and the generation handler.
 */
export function buildAgentFromCard(card: ParsedAgentCard): {
  content: string;
  metadata: { name: string; url: string; status: "active"; slug: string };
  anchorName: string;
} {
  const anchorName = card.anchor?.name ?? card.brainName;
  const kind = card.anchor?.kind ?? "professional";

  const aboutParts: string[] = [];
  if (card.anchor?.description) aboutParts.push(card.anchor.description);
  if (card.description) aboutParts.push(card.description);

  const content = agentAdapter.createAgentContent({
    name: anchorName,
    kind,
    ...(card.anchor?.organization && {
      organization: card.anchor.organization,
    }),
    brainName: card.brainName,
    url: card.url,
    status: "active",
    discoveredAt: new Date().toISOString(),
    discoveredVia: "manual",
    about: aboutParts.join("\n\n"),
    skills: card.skills.map((s) => ({
      name: s.name,
      description: s.description,
      tags: s.tags,
    })),
    notes: "",
  });

  return {
    content,
    metadata: {
      name: anchorName,
      url: card.url,
      status: "active",
      slug: slugifyUrl(card.url),
    },
    anchorName,
  };
}
