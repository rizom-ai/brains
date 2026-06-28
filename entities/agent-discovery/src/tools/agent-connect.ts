import type {
  EntityPluginContext,
  ServicePluginContext,
} from "@brains/plugins";
import {
  ConfirmationArgsStore,
  type Tool,
  type ToolResponse,
} from "@brains/mcp-service";
import { z } from "@brains/utils";
import { AgentAdapter } from "../adapters/agent-adapter";
import { AGENT_ENTITY_TYPE } from "../lib/constants";
import {
  extractDomain,
  fetchAgentCard,
  type FetchFn,
} from "../lib/fetch-agent-card";
import { buildAgentFromCard } from "../lib/build-agent-content";
import type { AgentEntity } from "../schemas/agent";

const agentConnectInputSchema = z.object({
  source: z.object({
    kind: z.literal("url"),
    url: z
      .string()
      .min(1)
      .describe(
        "Remote agent domain or URL to verify and connect. Preserve bare domains as bare domains.",
      ),
  }),
  confirmed: z.boolean().optional(),
  confirmationToken: z.string().optional(),
});

type AgentConnectInput = z.infer<typeof agentConnectInputSchema>;

type AgentConnectContext = Pick<
  EntityPluginContext | ServicePluginContext,
  "entityService" | "permissions"
>;

const agentAdapter = new AgentAdapter();

function normalizeSourceUrl(sourceUrl: string): {
  domain: string;
  fetchTarget: string;
} | null {
  const domain = extractDomain(sourceUrl);
  if (!domain) return null;
  return {
    domain,
    fetchTarget: sourceUrl.trim().startsWith("http")
      ? sourceUrl.trim()
      : domain,
  };
}

function getEntityIdForCard(inputDomain: string, cardUrl: string): string {
  const cardDomain = extractDomain(cardUrl);
  return (cardDomain || inputDomain).toLowerCase();
}

async function upsertConnectedAgent(params: {
  context: AgentConnectContext;
  entityId: string;
  sourceUrl: string;
  card: NonNullable<Awaited<ReturnType<typeof fetchAgentCard>>>;
}): Promise<{ entity: AgentEntity; created: boolean }> {
  const { context, entityId, card } = params;
  const now = new Date().toISOString();
  const existing = await context.entityService.getEntity<AgentEntity>({
    entityType: AGENT_ENTITY_TYPE,
    id: entityId,
  });
  const built = buildAgentFromCard(card, { status: "approved" });
  const parsedContent = agentAdapter.fromMarkdown(built.content);
  const metadata = {
    ...parsedContent.metadata,
    ...built.metadata,
    a2aEndpoint: card.url,
  };

  if (existing) {
    const updated: AgentEntity = {
      ...existing,
      content: built.content,
      metadata,
      updated: now,
    };
    await context.entityService.updateEntity({ entity: updated });
    return { entity: updated, created: false };
  }

  const entity: AgentEntity = {
    id: entityId,
    entityType: AGENT_ENTITY_TYPE,
    content: built.content,
    metadata,
    contentHash: "",
    visibility: "public",
    created: now,
    updated: now,
  };
  await context.entityService.createEntity({ entity });
  return { entity, created: true };
}

export function createAgentConnectTool(
  context: AgentConnectContext,
  fetchFn: FetchFn = globalThis.fetch,
): Tool {
  const toolName = "agent_connect";
  const confirmationArgsStore = new ConfirmationArgsStore();

  return {
    name: toolName,
    description:
      "Verify and connect a remote A2A agent by fetching its Agent Card from /.well-known/agent-card.json, then save the verified contact in the local agent directory as approved for future calls. This establishes and approves the contact; it does not message the remote agent. Requires confirmation before verification and persistence. Call this tool without confirmed on the initial request; the tool returns confirmation args for the user to approve.",
    inputSchema: agentConnectInputSchema.shape,
    visibility: "trusted",
    sideEffects: "external",
    handler: async (rawInput, toolContext): Promise<ToolResponse> => {
      const parsed = agentConnectInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.errors.map((error) => `${error.path.join(".")}: ${error.message}`).join(", ")}`,
        };
      }

      const input = parsed.data;
      const normalized = normalizeSourceUrl(input.source.url);
      if (!normalized) {
        return {
          success: false,
          error: "Provide a valid remote agent domain or URL to connect.",
          code: "invalid_agent_url",
        };
      }

      try {
        context.permissions.assertEntityActionAllowed(
          AGENT_ENTITY_TYPE,
          "create",
          toolContext,
        );
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      if (input.confirmed) {
        const token = input.confirmationToken;
        const validation = confirmationArgsStore.validate(token, input);
        if (validation.status === "missing") {
          return {
            success: false,
            error:
              "No pending agent connection confirmation found. Please request connection again and confirm the new approval.",
          };
        }
        if (validation.status === "mismatch") {
          return {
            success: false,
            error:
              "Confirmed agent connection arguments do not match the pending approval. Please request connection again and confirm the new approval.",
          };
        }

        const card = await fetchAgentCard(normalized.fetchTarget, fetchFn);
        if (!card) {
          return {
            success: false,
            error: `Could not verify an A2A Agent Card for ${normalized.domain}.`,
            code: "not_an_agent",
          };
        }

        const entityId = getEntityIdForCard(normalized.domain, card.url);
        const { entity, created } = await upsertConnectedAgent({
          context,
          entityId,
          sourceUrl: input.source.url,
          card,
        });

        return {
          success: true,
          data: {
            status: entity.metadata.status,
            entityId: entity.id,
            connected: true,
            created,
            a2aEndpoint: card.url,
            skills: card.skills.map((skill) => ({
              name: skill.name,
              description: skill.description,
              tags: skill.tags,
            })),
          },
        };
      }

      const confirmationArgs = confirmationArgsStore.create<AgentConnectInput>(
        (confirmationToken) => ({
          source: input.source,
          confirmed: true,
          confirmationToken,
        }),
      );

      return {
        needsConfirmation: true,
        toolName,
        summary: `Verify and connect agent ${normalized.domain}?`,
        preview: `This will fetch and validate ${normalized.domain}'s A2A Agent Card, then save the verified contact as approved for future calls. It will not message the remote agent.`,
        args: confirmationArgs,
      };
    },
  };
}
