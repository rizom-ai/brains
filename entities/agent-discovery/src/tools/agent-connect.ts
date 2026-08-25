import { z, type EntityReactionContext } from "@brains/sdk/entities";
import { defineTool, type ServiceToolDefinition } from "@brains/sdk/services";
import { parseAgentEntity } from "../lib/agent-content";
import { AGENT_ENTITY_TYPE } from "../lib/constants";
import {
  extractDomain,
  fetchAgentCard,
  type FetchFn,
} from "../lib/fetch-agent-card";
import { buildAgentFromCard } from "../lib/build-agent-content";
import type { AgentEntity } from "../schemas/agent";

const agentConnectInputSchema: z.ZodObject<{
  source: z.ZodObject<{ kind: z.ZodLiteral<"url">; url: z.ZodString }>;
}> = z.object({
  source: z.object({
    kind: z.literal("url"),
    url: z
      .string()
      .min(1)
      .describe(
        "Remote agent domain or URL to verify and connect. Preserve bare domains as bare domains.",
      ),
  }),
});

type AgentConnectContext = EntityReactionContext;

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
  const existing = await context.entities.getEntity<AgentEntity>({
    entityType: AGENT_ENTITY_TYPE,
    id: entityId,
  });
  const built = buildAgentFromCard(card, { status: "approved" });
  const metadata = {
    ...parseAgentEntity({ content: built.content }).frontmatter,
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
    await context.entities.update(updated);
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
  await context.entities.create(entity);
  return { entity, created: true };
}

const agentConnectOutputSchema: z.ZodObject<{
  status: z.ZodString;
  entityId: z.ZodString;
  connected: z.ZodBoolean;
  created: z.ZodBoolean;
  a2aEndpoint: z.ZodString;
  skills: z.ZodArray<
    z.ZodObject<{
      name: z.ZodString;
      description: z.ZodString;
      tags: z.ZodArray<z.ZodString>;
    }>
  >;
}> = z.object({
  status: z.string(),
  entityId: z.string(),
  connected: z.boolean(),
  created: z.boolean(),
  a2aEndpoint: z.string(),
  skills: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      tags: z.array(z.string()),
    }),
  ),
});

/**
 * Verify a remote agent and save it as a contact.
 *
 * Connecting is a decision about who the brain will call, so it asks first —
 * the runtime holds the confirmation, which is why this reads as one pass
 * rather than two.
 */
export function agentConnectTool(
  fetchFn: FetchFn = globalThis.fetch,
): ServiceToolDefinition<
  "connect",
  typeof agentConnectInputSchema,
  typeof agentConnectOutputSchema
> {
  return defineTool({
    name: "connect",
    description:
      "Verify and connect a remote A2A agent by fetching its Agent Card from /.well-known/agent-card.json, then save the verified contact in the local agent directory as approved for future outbound calls. Never use this tool for a request to approve or archive an existing saved contact; update that contact's status with system_update instead. This adds a directory contact; it does not message the remote agent or grant it inbound trusted access.",
    input: agentConnectInputSchema,
    output: agentConnectOutputSchema,
    permission: "trusted",
    sideEffects: "external",
    confirmation: ({ source }) =>
      `Verify and connect agent ${normalizeSourceUrl(source.url)?.domain ?? source.url}? This fetches and validates its A2A Agent Card, then saves the verified contact as approved for future outbound calls. It does not message the remote agent or grant it inbound trusted access.`,
    execute: async ({ input, caller, ...context }) => {
      const normalized = normalizeSourceUrl(input.source.url);
      if (!normalized) {
        throw new Error(
          "Provide a valid remote agent domain or URL to connect.",
        );
      }

      // Who may add a contact is the caller's question, not the tool's.
      context.permissions.assertEntityActionAllowed(
        AGENT_ENTITY_TYPE,
        "create",
        caller ?? {},
      );

      const card = await fetchAgentCard(normalized.fetchTarget, fetchFn);
      if (!card) {
        throw new Error(
          `Could not verify an A2A Agent Card for ${normalized.domain}.`,
        );
      }

      const { entity, created } = await upsertConnectedAgent({
        context,
        entityId: getEntityIdForCard(normalized.domain, card.url),
        sourceUrl: input.source.url,
        card,
      });

      return {
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
      };
    },
  });
}
