import { slugifyUrl } from "@brains/utils";
import { AgentAdapter } from "../adapters/agent-adapter";
import type { AgentStatus } from "../schemas/agent";
import type { ParsedAgentCard } from "./fetch-agent-card";
import { normalizeTags } from "./tag-vocabulary";

const agentAdapter = new AgentAdapter();

export function buildAgentFromCard(card: ParsedAgentCard): {
  content: string;
  metadata: { name: string; url: string; status: AgentStatus; slug: string };
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
    status: "discovered",
    discoveredAt: new Date().toISOString(),
    about: aboutParts.join("\n\n"),
    skills: card.skills.map((s) => ({
      name: s.name,
      description: s.description,
      tags: normalizeTags(s.tags),
    })),
    notes: "",
  });

  return {
    content,
    metadata: {
      name: anchorName,
      url: card.url,
      status: "discovered",
      slug: slugifyUrl(card.url),
    },
    anchorName,
  };
}
