import type { EntityGenerationDeclaration } from "@brains/sdk/entities";
import {
  fetchVerifiedAgentCard,
  isEndpointRefusal,
} from "@brains/sdk/internal/service-runtime";
import type { FetchLike } from "@brains/utils/fetch-like";
import { z } from "@brains/utils/zod";
import type { agentMetadataSchema } from "../schemas/agent";
import { buildAgentFromCard } from "./build-agent-content";
import { extractDomain } from "./extract-domain";

export const agentGenerationJobSchema: z.ZodObject<{
  prompt: z.ZodOptional<z.ZodString>;
  url: z.ZodOptional<z.ZodString>;
  content: z.ZodOptional<z.ZodString>;
  skipAi: z.ZodOptional<z.ZodBoolean>;
  status: z.ZodOptional<
    z.ZodEnum<{
      discovered: "discovered";
      approved: "approved";
      archived: "archived";
    }>
  >;
}> = z.object({
  prompt: z.string().optional(),
  url: z.string().optional(),
  content: z.string().optional(),
  skipAi: z.boolean().optional(),
  status: z.enum(["discovered", "approved", "archived"]).optional(),
});

/**
 * An agent made from its Agent Card, as `agent:generation` made it: the
 * card fetched and verified from the domain the request names, its anchor
 * and skills written into the agent, saved under the domain. No AI: all
 * content comes from the card.
 */
export function agentGeneration(
  fetch: FetchLike | undefined,
): EntityGenerationDeclaration<
  typeof agentGenerationJobSchema,
  typeof agentMetadataSchema
> {
  return {
    input: agentGenerationJobSchema,
    generate: async ({
      input,
    }): ReturnType<
      EntityGenerationDeclaration<
        typeof agentGenerationJobSchema,
        typeof agentMetadataSchema
      >["generate"]
    > => {
      const domain = extractDomain(input.url ?? input.prompt ?? "");
      if (!domain) {
        return {
          success: false,
          error:
            "No URL or domain provided. Use: system_create agent with a domain like yeehaa.io",
        };
      }
      // The job carries no cancellation; the card fetch's timeout bounds it.
      const verified = await fetchVerifiedAgentCard(domain, {
        fetch: fetch ?? globalThis.fetch,
      });
      if (!verified.ok) {
        return {
          success: false,
          error: isEndpointRefusal(verified.reason)
            ? verified.error
            : `Could not fetch Agent Card from ${domain}. Make sure the agent is running and accessible.`,
        };
      }
      const { content, metadata } = buildAgentFromCard(verified.card, {
        ...(input.status !== undefined ? { status: input.status } : {}),
      });
      return { success: true, id: domain, content, metadata };
    },
  };
}
