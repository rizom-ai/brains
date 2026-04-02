import type { EntityPluginContext } from "@brains/plugins";
import { fetchAgentCard } from "./fetch-agent-card";
import { buildAgentFromCard } from "./build-agent-content";

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

        const { content, metadata } = buildAgentFromCard(card);

        await context.entityService.createEntity({
          id: domain,
          entityType: "agent",
          content,
          metadata,
        });
      } catch {
        // Silently fail — auto-create is best-effort
      }
      return { success: true };
    },
  );
}
