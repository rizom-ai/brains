import type {
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
  EntityPluginContext,
} from "@brains/plugins";
import type { AgentEntity } from "../schemas/agent";
import { AGENT_ENTITY_TYPE, AGENT_GENERATION_JOB_TYPE } from "./constants";
import { extractDomain } from "./fetch-agent-card";

export async function interceptAgentUrlCreate(
  input: CreateInput,
  executionContext: CreateExecutionContext,
  context: EntityPluginContext,
  sourcePluginId: string,
): Promise<CreateInterceptionResult> {
  if (!input.url || input.prompt || input.content) {
    return { kind: "continue", input };
  }

  const domain = extractDomain(input.url);
  const deduplicationKey = domain || input.url.trim().toLowerCase();

  if (domain) {
    const existing = await context.entityService.getEntity<AgentEntity>({
      entityType: AGENT_ENTITY_TYPE,
      id: domain,
    });

    if (existing) {
      if (existing.metadata.status !== "approved") {
        // Update metadata only. AgentAdapter.toMarkdown rebuilds frontmatter
        // from metadata on write, so content stays in sync.
        await context.entityService.updateEntity({
          entity: {
            ...existing,
            metadata: {
              ...existing.metadata,
              status: "approved",
            },
          },
        });
      }

      return {
        kind: "handled",
        result: {
          success: true,
          data: { status: "created", entityId: existing.id },
        },
      };
    }
  }

  const jobId = await context.jobs.enqueue({
    type: AGENT_GENERATION_JOB_TYPE,
    data: {
      prompt: input.url,
      url: input.url,
      status: "approved",
    },
    toolContext: executionContext,
    options: {
      source: sourcePluginId,
      metadata: { operationType: "data_processing" },
      deduplication: "coalesce",
      deduplicationKey,
      maxRetries: 0,
    },
  });

  return {
    kind: "handled",
    result: {
      success: true,
      data: { status: "generating", jobId },
    },
  };
}
