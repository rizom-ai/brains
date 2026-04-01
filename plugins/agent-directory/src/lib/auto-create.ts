import type { AgentAdapter } from "@brains/agent-directory";
import type { FetchedAgentCard } from "./fetch-agent-card";

interface EntityService {
  getEntity(type: string, id: string): Promise<{ id: string } | null>;
  createEntity(entity: {
    id: string;
    entityType: string;
    content: string;
    metadata: Record<string, unknown>;
  }): Promise<{ entityId: string }>;
}

export interface A2ACallCompletedPayload {
  domain: string;
  card: FetchedAgentCard;
}

/**
 * Handle auto-creation of agent entity after a successful a2a_call.
 * Only creates if no entity exists for this domain.
 */
export async function handleA2ACallCompleted(
  entityService: EntityService,
  adapter: AgentAdapter,
  payload: A2ACallCompletedPayload,
): Promise<void> {
  const { domain, card } = payload;

  // Don't overwrite existing entities
  const existing = await entityService.getEntity("agent", domain);
  if (existing) return;

  const anchorName = card.anchor?.name ?? card.brainName;
  const kind = card.anchor?.kind ?? "professional";

  const aboutParts: string[] = [];
  if (card.anchor?.description) aboutParts.push(card.anchor.description);
  if (card.description) aboutParts.push(card.description);

  const content = adapter.createAgentContent({
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

  await entityService.createEntity({
    id: domain,
    entityType: "agent",
    content,
    metadata: { name: anchorName, status: "active" },
  });
}
