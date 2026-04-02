import type { EntityPluginContext } from "@brains/plugins";
import { slugifyUrl } from "@brains/utils";
import { AgentAdapter } from "../adapters/agent-adapter";
import { fetchAgentCard } from "./fetch-agent-card";

const agentAdapter = new AgentAdapter();

export interface A2ACallCompletedPayload {
  domain: string;
}

/**
 * Subscribe to a2a:call:completed events and auto-create agent entities.
 * Only creates if no entity exists for this domain.
 */
export function subscribeToAutoCreate(context: EntityPluginContext): void {
  context.messaging.subscribe<A2ACallCompletedPayload>(
    "a2a:call:completed",
    async (msg) => {
      try {
        const { domain } = msg.payload;

        const existing = await context.entityService.getEntity("agent", domain);
        if (existing) return { success: true };

        const card = await fetchAgentCard(domain, globalThis.fetch);
        if (!card) return { success: true };

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

        await context.entityService.createEntity({
          id: domain,
          entityType: "agent",
          content,
          metadata: {
            name: anchorName,
            url: card.url,
            status: "active",
            slug: slugifyUrl(card.url),
          },
        });
      } catch {
        // Silently fail — auto-create is best-effort
      }
      return { success: true };
    },
  );
}
