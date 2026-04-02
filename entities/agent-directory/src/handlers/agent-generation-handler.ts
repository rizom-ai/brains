import type { EntityPluginContext, GeneratedContent } from "@brains/plugins";
import { BaseGenerationJobHandler } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z, slugifyUrl, generationResultSchema } from "@brains/utils";
import { AgentAdapter } from "../adapters/agent-adapter";
import { fetchAgentCard, extractDomain } from "../lib/fetch-agent-card";

const agentAdapter = new AgentAdapter();

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

    return {
      id: domain,
      content,
      metadata: {
        name: anchorName,
        url: card.url,
        status: "active",
        slug: slugifyUrl(card.url),
      },
    };
  }
}
