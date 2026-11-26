import { a2aSharedEntityContract } from "@brains/contracts";
import type { Tool, ToolResponse } from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";
import type { AgentContext } from "../lib/agent-context";
import { extractDomain } from "../lib/extract-domain";

const sharedEntitiesInputSchema = z.object({
  agent: z
    .string()
    .min(1)
    .describe("The saved, approved agent to ask: its id, domain or URL."),
  action: z
    .enum(["show"])
    .describe("show fetches one shared entity and returns its text."),
  entityType: z
    .string()
    .min(1)
    .optional()
    .describe("The entity's type on the peer, such as note or post."),
  id: z.string().min(1).optional().describe("The entity's id on the peer."),
});

type SharedEntitiesContext = Pick<AgentContext, "messaging">;

/**
 * What an approved peer shares with this brain: the one tool for it. It
 * asks the peer over A2A's entity-sharing extension, signed, with no model
 * on either side of the request.
 */
export function createAgentSharedEntitiesTool(
  context: SharedEntitiesContext,
): Tool {
  return {
    name: "agent_shared_entities",
    description:
      "Read what an approved peer brain shares with this brain. show fetches one shared entity by its type and id and returns its text without saving anything. The peer serves only entities its owner marked shared, only to a brain it trusts; anything else, it answers as not found. Use agent_call to ask a peer a question; use this only for a specific shared entity.",
    inputSchema: sharedEntitiesInputSchema.shape,
    visibility: "admin",
    sideEffects: "external",
    handler: async (rawInput): Promise<ToolResponse> => {
      const parsed = sharedEntitiesInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
        };
      }
      const { entityType, id } = parsed.data;
      if (!entityType || !id) {
        return {
          success: false,
          error: "show needs the entity's entityType and id.",
        };
      }
      const agent = (
        extractDomain(parsed.data.agent) || parsed.data.agent.trim()
      ).toLowerCase();

      const asked = await context.messaging.request(a2aSharedEntityContract, {
        agent,
        entityType,
        id,
      });
      if (asked.status === "unavailable") {
        return {
          success: false,
          code: "a2a_unavailable",
          error: "This brain has no A2A interface to ask a peer through.",
        };
      }
      if (asked.status === "failed") {
        return {
          success: false,
          code: asked.error.code,
          error: asked.error.message,
        };
      }
      const answer = asked.data;

      if (answer.status === "found") {
        return {
          success: true,
          data: {
            agent,
            entityType: answer.entity.entityType,
            id: answer.entity.id,
            markdown: answer.entity.markdown,
          },
        };
      }
      if (answer.status === "not-found") {
        return {
          success: false,
          code: "not_found",
          error: `${agent} shares no ${entityType} "${id}" with this brain. It may not exist, or may not be shared with you.`,
        };
      }
      return { success: false, code: answer.code, error: answer.error };
    },
  };
}
