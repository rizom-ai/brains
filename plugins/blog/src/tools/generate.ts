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
  prompt: z.string().optional(),
  title: z.string().describe("Blog post title"),
  content: z.string().describe("Blog post content in markdown format"),
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
      "Create a new blog post draft (provide title and content, or AI will help generate)",
    inputSchema: generateInputSchema.shape,
    handler: async (input: unknown): Promise<ToolResponse> => {
      try {
        const parsed = generateInputSchema.parse(input);
        const { title, content, excerpt, coverImage, seriesName, seriesIndex } =
          parsed;

        // Generate slug from title
        const slug = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");

        // Generate excerpt if not provided (first 200 chars of content)
        const finalExcerpt =
          excerpt ?? content.substring(0, 200).trim() + "...";

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
