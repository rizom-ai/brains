import type { Tool, ServicePluginContext } from "@brains/plugins";
import { createTool, toolSuccess, toolError } from "@brains/plugins";
import { z, updateFrontmatterField } from "@brains/utils";
import { AgentAdapter } from "@brains/agent-directory";
import {
  fetchAgentCard,
  extractDomain,
  type FetchFn,
} from "../lib/fetch-agent-card";

const agentAdapter = new AgentAdapter();

export interface AgentDirectoryDeps {
  fetch?: FetchFn;
}

export function createAgentDirectoryTools(
  pluginId: string,
  context: ServicePluginContext,
  deps: AgentDirectoryDeps = {},
): Tool[] {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const { entityService } = context;

  return [
    createTool(
      pluginId,
      "add",
      "Add an agent to the directory. Fetches the Agent Card and creates a contact entity.",
      z.object({
        url: z.string().describe("Domain or URL of the agent (e.g. yeehaa.io)"),
      }),
      async (input) => {
        const domain = extractDomain(input.url);

        const card = await fetchAgentCard(domain, fetchFn);
        if (!card) {
          return toolError(
            `Could not fetch Agent Card from ${domain}. Make sure the agent is running and accessible.`,
          );
        }

        // Use anchor name if available, fall back to brain name
        const anchorName = card.anchor?.name ?? card.brainName;

        // Build about section from available descriptions
        const aboutParts: string[] = [];
        if (card.anchor?.description) aboutParts.push(card.anchor.description);
        if (card.description) aboutParts.push(card.description);
        const about = aboutParts.join("\n\n");

        const kind = card.anchor?.kind ?? "professional";

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
          about,
          skills: card.skills.map((s) => ({
            name: s.name,
            description: s.description,
            tags: s.tags,
          })),
          notes: "",
        });

        try {
          const result = await entityService.createEntity({
            id: domain,
            entityType: "agent",
            content,
            metadata: { name: anchorName, url: card.url, status: "active" },
          });

          return toolSuccess(
            { entityId: result.entityId, name: anchorName, domain },
            `Added ${anchorName} (${domain}) to the directory`,
          );
        } catch (error) {
          return toolError(
            error instanceof Error
              ? error.message
              : "Failed to create agent entity",
          );
        }
      },
    ),

    createTool(
      pluginId,
      "remove",
      "Archive an agent — sets status to archived. The agent remains in the directory but a2a_call will refuse to contact it.",
      z.object({
        agent: z.string().describe("Agent domain, ID, or name"),
      }),
      async (input) => {
        const entity = await entityService.getEntity("agent", input.agent);
        if (!entity) {
          return toolError(`Agent not found: ${input.agent}`);
        }

        const updatedContent = updateFrontmatterField(
          entity.content,
          "status",
          "archived",
        );

        try {
          await entityService.updateEntity({
            ...entity,
            content: updatedContent,
            metadata: { ...entity.metadata, status: "archived" },
          });

          return toolSuccess({ entityId: entity.id }, `Archived ${entity.id}`);
        } catch (error) {
          return toolError(
            error instanceof Error ? error.message : "Failed to archive agent",
          );
        }
      },
    ),
  ];
}
