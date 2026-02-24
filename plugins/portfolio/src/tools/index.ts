import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createTypedTool } from "@brains/plugins";
import { z } from "@brains/utils";

/**
 * Input schema for portfolio_create tool
 */
export const createInputSchema = z.object({
  topic: z
    .string()
    .describe(
      "Topic/name of the project to document (used to search for related content)",
    ),
  year: z.number().describe("Year the project was completed"),
  title: z
    .string()
    .optional()
    .describe("Project title (will be derived from topic if not provided)"),
});

export type CreateInput = z.infer<typeof createInputSchema>;

/**
 * Create portfolio plugin tools
 */
export function createPortfolioTools(
  pluginId: string,
  context: ServicePluginContext,
): PluginTool[] {
  return [
    // portfolio_create - Create project case study from existing knowledge
    createTypedTool(
      pluginId,
      "create",
      "Create a portfolio project case study by searching for related content in the brain. Searches notes, links, and posts about the topic, then generates a structured case study with context, problem, solution, and outcome. IMPORTANT: If the search finds insufficient content, ask the user for a project URL and use link_capture to capture it first before creating the project.",
      createInputSchema,
      async (input, toolContext) => {
        // Search for related content across entity types
        const entityTypes = ["base", "link", "post", "topic"];
        const relatedContent: string[] = [];

        // Search across all types at once
        const results = await context.entityService.search(input.topic, {
          types: entityTypes,
          limit: 10,
        });

        for (const result of results) {
          const entity = result.entity;
          relatedContent.push(
            `[${entity.entityType}: ${entity.metadata["title"] ?? entity.id}]\n${entity.content}`,
          );
        }

        // Build enriched prompt with found context
        const contextSection =
          relatedContent.length > 0
            ? `\n\nRelated content found in the brain:\n\n${relatedContent.join("\n\n---\n\n")}`
            : "";

        const enrichedPrompt = `Create a case study for: ${input.topic}${contextSection}`;

        // Enqueue the project generation job with enriched context
        const jobId = await context.jobs.enqueue(
          "generation",
          {
            prompt: enrichedPrompt,
            year: input.year,
            title: input.title,
          },
          toolContext,
          {
            source: `${pluginId}_create`,
            metadata: {
              operationType: "content_operations",
              operationTarget: "project",
            },
          },
        );

        return {
          success: true,
          data: { jobId, relatedEntitiesFound: relatedContent.length },
          message: `Project creation job queued. Found ${relatedContent.length} related entities.`,
        };
      },
    ),
    // Publish tool removed - use publish-pipeline_publish instead
  ];
}
