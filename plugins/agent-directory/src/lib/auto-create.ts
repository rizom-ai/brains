import type { IEntityService } from "@brains/plugins";
import type { AgentAdapter } from "@brains/agent-directory";
import { fetchAgentCard, type FetchFn } from "./fetch-agent-card";

export interface A2ACallCompletedPayload {
  domain: string;
}

/**
 * Handle auto-creation of agent entity after a successful a2a_call.
 * Fetches the full Agent Card and creates a rich entity.
 * Only creates if no entity exists for this domain.
 */
export async function handleA2ACallCompleted(
  entityService: IEntityService,
  adapter: AgentAdapter,
  fetchFn: FetchFn,
  payload: A2ACallCompletedPayload,
): Promise<void> {
  const { domain } = payload;

  const existing = await entityService.getEntity("agent", domain);
  if (existing) return;

  const card = await fetchAgentCard(domain, fetchFn);
  if (!card) return;

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
    metadata: { name: anchorName, url: card.url, status: "active" },
  });
}
