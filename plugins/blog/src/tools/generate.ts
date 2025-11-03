import type {
  PluginTool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils";
import type { BlogConfig } from "../config";

/**
 * Input schema for blog:generate tool
 */
export const generateInputSchema = z.object({
  prompt: z
    .string()
    .optional()
    .describe(
      "Topic or prompt for AI to generate blog post content from (required if title/content not provided)",
    ),
  title: z
    .string()
    .optional()
    .describe("Blog post title (will be AI-generated if not provided)"),
  content: z
    .string()
    .optional()
    .describe(
      "Blog post content in markdown format (will be AI-generated if not provided)",
    ),
  excerpt: z
    .string()
    .optional()
    .describe("Short excerpt/summary (will be auto-generated if not provided)"),
  coverImage: z.string().optional(),
  seriesName: z.string().optional(),
  seriesIndex: z.number().optional(),
});

export type GenerateInput = z.infer<typeof generateInputSchema>;

/**
 * Create the blog:generate tool
 */
export function createGenerateTool(
  context: ServicePluginContext,
  _config: BlogConfig,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}:generate`,
    description:
      "Create a new blog post draft (provide title and content, or just a prompt for AI generation)",
    inputSchema: generateInputSchema.shape,
    handler: async (input: unknown): Promise<ToolResponse> => {
      try {
        const parsed = generateInputSchema.parse(input);
        const { prompt, coverImage, seriesName, seriesIndex } = parsed;
        let { title, content, excerpt } = parsed;

        // Case 1: AI generates everything (title, content, excerpt)
        if (!title || !content) {
          if (!prompt) {
            return {
              success: false,
              error:
                "Either provide title and content, or provide a prompt for AI to generate them",
            };
          }

          const generationPrompt = `${prompt}${seriesName ? `\n\nNote: This is part of a series called "${seriesName}".` : ""}`;

          const generated = await context.generateContent<{
            title: string;
            content: string;
            excerpt: string;
          }>({
            prompt: generationPrompt,
            templateName: "blog:generation",
          });

          title = title ?? generated.title;
          content = content ?? generated.content;
          excerpt = excerpt ?? generated.excerpt;
        }
        // Case 2: User provided title+content, but no excerpt - AI generates excerpt
        else if (!excerpt) {
          const excerptGenerated = await context.generateContent<{
            excerpt: string;
          }>({
            prompt: `Title: ${title}\n\nContent:\n${content}`,
            templateName: "blog:excerpt",
          });

          excerpt = excerptGenerated.excerpt;
        }

        // Generate slug from title
        const slug = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");

        const finalExcerpt = excerpt;

        // Get author from profile entity
        const profile = await context.entityService.getEntity(
          "profile",
          "PROFILE",
        );
        if (!profile?.metadata) {
          return {
            success: false,
            error: "Profile entity not found or invalid",
          };
        }
        const author = (profile.metadata as Record<string, unknown>)[
          "name"
        ] as string;

        // Handle series indexing
        let finalSeriesIndex = seriesIndex;
        if (seriesName && !seriesIndex) {
          const seriesPosts = await context.entityService.listEntities("blog");
          const postsInSeries = seriesPosts.filter(
            (p) =>
              p.metadata &&
              (p.metadata as Record<string, unknown>)["seriesName"] ===
                seriesName &&
              (p.metadata as Record<string, unknown>)["publishedAt"],
          );
          finalSeriesIndex = postsInSeries.length + 1;
        }

        // Create entity
        const entity = await context.entityService.createEntity({
          entityType: "blog",
          content,
          metadata: {
            title,
            slug,
            status: "draft" as const,
            excerpt: finalExcerpt,
            author,
            ...(coverImage && { coverImage }),
            ...(seriesName && { seriesName }),
            ...(finalSeriesIndex && { seriesIndex: finalSeriesIndex }),
          },
        });

        return {
          success: true,
          data: entity,
          message: `Blog post "${title}" created successfully`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
