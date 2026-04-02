import type { EntityPluginContext, GeneratedContent } from "@brains/plugins";
import { BaseGenerationJobHandler } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z, generationResultSchema } from "@brains/utils";
import { fetchAgentCard, extractDomain } from "../lib/fetch-agent-card";
import { buildAgentFromCard } from "../lib/build-agent-content";

/**
 * Input schema for agent generation — just needs a URL/domain.
 */
export const agentGenerationJobSchema = z.object({
  prompt: z.string().optional(),
  url: z.string().optional(),
  content: z.string().optional(),
  skipAi: z.boolean().optional(),
});

export type AgentGenerationJobData = z.infer<typeof agentGenerationJobSchema>;

export const agentGenerationResultSchema = generationResultSchema.extend({
  name: z.string().optional(),
  domain: z.string().optional(),
});

export type AgentGenerationResult = z.infer<typeof agentGenerationResultSchema>;

/**
 * Generation handler for agent entities.
 * Fetches an Agent Card from the given URL/domain, parses anchor info,
 * and creates a rich agent entity with skills and about sections.
 *
 * No AI needed — all content comes from the Agent Card.
 */
export class AgentGenerationJobHandler extends BaseGenerationJobHandler<
  AgentGenerationJobData,
  AgentGenerationResult
> {
  constructor(logger: Logger, context: EntityPluginContext) {
    super(logger, context, {
      schema: agentGenerationJobSchema,
      jobTypeName: "agent-generation",
      entityType: "agent",
    });
  }

  protected async generate(
    data: AgentGenerationJobData,
    _progressReporter: ProgressReporter,
  ): Promise<GeneratedContent> {
    // Extract domain from prompt or explicit url field
    const rawUrl = data.url ?? data.prompt ?? "";
    const domain = extractDomain(rawUrl);

    if (!domain) {
      throw new Error(
        "No URL or domain provided. Use: system_create agent with a domain like yeehaa.io",
      );
    }

    const card = await fetchAgentCard(domain, globalThis.fetch);
    if (!card) {
      throw new Error(
        `Could not fetch Agent Card from ${domain}. Make sure the agent is running and accessible.`,
      );
    }

    const { content, metadata, anchorName } = buildAgentFromCard(card);

    return {
      id: domain,
      content,
      metadata,
      title: anchorName,
    };
  }
}
