import type {
  PluginTool,
  ToolResponse,
  ToolContext,
  ServicePluginContext,
} from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z, formatAsEntity } from "@brains/utils";
import { projectAdapter } from "../adapters/project-adapter";
import { projectFrontmatterSchema, type Project } from "../schemas/project";

/**
 * Input schema for portfolio_generate tool
 */
export const generateInputSchema = z.object({
  prompt: z.string().describe("Description of the project to generate"),
  year: z.number().describe("Year the project was completed"),
  title: z
    .string()
    .optional()
    .describe("Project title (will be AI-generated if not provided)"),
});

export type GenerateInput = z.infer<typeof generateInputSchema>;

/**
 * Input schema for portfolio_publish tool
 */
export const publishInputSchema = z.object({
  slug: z.string().describe("Slug of the project to publish"),
});

export type PublishInput = z.infer<typeof publishInputSchema>;

/**
 * Create portfolio plugin tools
 */
export function createPortfolioTools(
  pluginId: string,
  context: ServicePluginContext,
): PluginTool[] {
  return [
    // portfolio_generate - AI-powered project generation
    {
      name: `${pluginId}_generate`,
      description:
        "Queue a job to generate a portfolio project case study using AI. Creates structured content with context, problem, solution, and outcome.",
      inputSchema: generateInputSchema.shape,
      visibility: "anchor",
      handler: async (
        input: unknown,
        toolContext: ToolContext,
      ): Promise<ToolResponse> => {
        try {
          const parsed = generateInputSchema.parse(input);

          // Enqueue the project generation job
          const jobId = await context.enqueueJob(
            "generation",
            parsed,
            toolContext,
            {
              source: `${pluginId}_generate`,
              metadata: {
                operationType: "content_operations",
                operationTarget: "project",
              },
            },
          );

          const formatted = formatAsEntity(
            {
              jobId,
              title: parsed.title ?? "(AI generated)",
              year: parsed.year,
              status: "queued",
            },
            { title: "Project Generation" },
          );

          return {
            success: true,
            data: { jobId },
            message: `Project generation job queued (jobId: ${jobId})`,
            formatted,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: msg,
            formatted: `_Error: ${msg}_`,
          };
        }
      },
    },

    // portfolio_publish - Publish a draft project
    {
      name: `${pluginId}_publish`,
      description:
        "Publish a draft portfolio project, making it visible on the public site.",
      inputSchema: publishInputSchema.shape,
      visibility: "anchor",
      handler: async (input: unknown): Promise<ToolResponse> => {
        try {
          const parsed = publishInputSchema.parse(input);

          // Find the project by slug
          const entities = await context.entityService.listEntities<Project>(
            "project",
            {
              filter: { metadata: { slug: parsed.slug } },
              limit: 1,
            },
          );

          const project = entities[0];
          if (!project) {
            return {
              success: false,
              error: `Project with slug "${parsed.slug}" not found`,
              formatted: `_Error: Project not found_`,
            };
          }

          // Parse current frontmatter
          const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
            project.content,
            projectFrontmatterSchema,
          );

          // Update status and add publishedAt
          const updatedFrontmatter = {
            ...frontmatter,
            status: "published" as const,
            publishedAt: new Date().toISOString(),
          };

          // Create updated content
          const updatedContent = projectAdapter.createProjectContent(
            updatedFrontmatter,
            projectAdapter.parseStructuredContent(project),
          );

          // Update entity
          await context.entityService.updateEntity({
            ...project,
            content: updatedContent,
            metadata: {
              ...project.metadata,
              status: "published",
              publishedAt: updatedFrontmatter.publishedAt,
            },
          });

          const formatted = formatAsEntity(
            {
              slug: parsed.slug,
              title: frontmatter.title,
              status: "published",
              publishedAt: updatedFrontmatter.publishedAt,
            },
            { title: "Project Published" },
          );

          return {
            success: true,
            data: {
              slug: parsed.slug,
              publishedAt: updatedFrontmatter.publishedAt,
            },
            message: `Project "${frontmatter.title}" published successfully`,
            formatted,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: msg,
            formatted: `_Error: ${msg}_`,
          };
        }
      },
    },
  ];
}
