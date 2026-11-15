import { agentFromMarkdown } from "../lib/agent-content";
import type { FetchLike } from "@brains/utils/fetch-like";
import { z } from "@brains/utils/zod";
import { AGENT_ENTITY_TYPE } from "../lib/constants";
import { extractDomain } from "../lib/extract-domain";
import { buildAgentFromCard } from "../lib/build-agent-content";
import { agentEntitySchema, type AgentEntity } from "../schemas/agent";
import { getErrorMessage } from "@brains/utils/error";
import {
  ConfirmationArgsStore,
  fetchVerifiedAgentCard,
  internalFullScope,
  isEndpointRefusal,
  type ParsedAgentCard,
  type Tool,
  type ToolResponse,
} from "@brains/sdk/internal/service-runtime";
import { canWriteVisibility } from "@brains/sdk/internal/entity-runtime";
import type { AgentContext } from "../lib/agent-context";

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

type AgentConnectContext = Pick<AgentContext, "entityService" | "permissions">;

/**
 * The host an agent is connected under: the one its card is fetched from,
 * over HTTPS. An http:// source is refused rather than upgraded.
 */
function normalizeSourceUrl(
  sourceUrl: string,
): { ok: true; domain: string } | { ok: false; error: string } {
  if (/^http:\/\//i.test(sourceUrl.trim())) {
    return {
      ok: false,
      error: "Invalid agent URL. Agent URLs must use https://.",
    };
  }
  const domain = extractDomain(sourceUrl).toLowerCase();
  if (!domain) {
    return {
      ok: false,
      error: "Provide a valid remote agent domain or URL to connect.",
    };
  }
  return { ok: true, domain };
}

/**
 * The agent already saved under `entityId`, at any visibility: whether
 * connecting creates or updates it depends on what is stored, not on what
 * the caller may read.
 */
function findSavedAgent(
  context: AgentConnectContext,
  entityId: string,
): Promise<AgentEntity | null> {
  return context.entityService.getEntity(
    {
      entityType: AGENT_ENTITY_TYPE,
      id: entityId,
      visibilityScope: internalFullScope(
        "agent_connect decides create or update; a refusal reveals only that the agent is saved",
      ),
    },
    agentEntitySchema,
  );
}

async function upsertConnectedAgent(params: {
  context: AgentConnectContext;
  entityId: string;
  existing: AgentEntity | null;
  card: ParsedAgentCard;
}): Promise<{ entity: AgentEntity; created: boolean }> {
  const { context, entityId, existing, card } = params;
  const now = new Date().toISOString();
  const built = buildAgentFromCard(card, { status: "approved" });
  const parsedContent = agentFromMarkdown(built.content);
  const metadata = {
    ...parsedContent.metadata,
    ...built.metadata,
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
  fetchFn: FetchLike = globalThis.fetch,
): Tool {
  const toolName = "agent_connect";
  const confirmationArgsStore = new ConfirmationArgsStore();

  return {
    name: toolName,
    description:
      "Verify and connect a remote A2A agent by fetching its Agent Card from /.well-known/agent-card.json, then save the verified contact in the local agent directory as approved for future outbound calls. Never use this tool for a request to approve or archive an existing saved contact; update that contact's status with system_update instead. This adds a directory contact; it does not message the remote agent or grant it inbound trusted access. Requires confirmation before verification and persistence. Call this tool without confirmed on the initial request; the tool returns confirmation args for the user to approve.",
    inputSchema: agentConnectInputSchema.shape,
    visibility: "trusted",
    sideEffects: "external",
    handler: async (rawInput, toolContext): Promise<ToolResponse> => {
      const parsed = agentConnectInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
        };
      }

      const input = parsed.data;
      const normalized = normalizeSourceUrl(input.source.url);
      if (!normalized.ok) {
        return {
          success: false,
          error: normalized.error,
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
          error: getErrorMessage(error),
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

        // A caller may change only what it may write: an agent saved above
        // that is refused before any request, naming no content or status.
        const existing = await findSavedAgent(context, normalized.domain);
        if (
          existing &&
          !canWriteVisibility(
            toolContext.userPermissionLevel,
            existing.visibility,
          )
        ) {
          return {
            success: false,
            error: `Agent ${normalized.domain} is already saved and can't be changed at your access.`,
            code: "agent_already_saved",
          };
        }

        const verified = await fetchVerifiedAgentCard(normalized.domain, {
          fetch: fetchFn,
          signal: toolContext.signal,
        });
        if (!verified.ok) {
          // A card that points elsewhere would save and approve the agent
          // under a host it was not fetched from; refuse it, naming both.
          if (isEndpointRefusal(verified.reason)) {
            return {
              success: false,
              error: verified.error,
              code: "untrusted_agent_card",
            };
          }
          if (verified.reason === "invalid_host") {
            return {
              success: false,
              error: verified.error,
              code: "invalid_agent_url",
            };
          }
          return {
            success: false,
            error: `Could not verify an A2A Agent Card for ${normalized.domain}.`,
            code: "not_an_agent",
          };
        }

        const { card } = verified;
        const { entity, created } = await upsertConnectedAgent({
          context,
          entityId: normalized.domain,
          existing,
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
        preview: `This will fetch and validate ${normalized.domain}'s A2A Agent Card, then save the verified contact as approved for future outbound calls. It will not message the remote agent or grant it inbound trusted access.`,
        args: confirmationArgs,
      };
    },
  };
}
