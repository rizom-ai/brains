import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createTool, parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z, slugify, computeContentHash } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";
import { blogPostFrontmatterSchema } from "../schemas/blog-post";
import type { Series } from "../schemas/series";
import { seriesFrontmatterSchema } from "../schemas/series";
import { seriesAdapter } from "../adapters/series-adapter";

/**
 * Input schema for blog_enhance-series tool
 */
export const enhanceSeriesInputSchema = z.object({
  seriesId: z
    .string()
    .describe("Series ID or slug (e.g., 'series-my-series' or 'my-series')"),
});

export type EnhanceSeriesInput = z.infer<typeof enhanceSeriesInputSchema>;

/**
 * Create the blog_enhance-series tool
 */
export function createEnhanceSeriesToolFactory(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool {
  return createTool(
    pluginId,
    "enhance-series",
    "Generate a description for a blog series based on its posts. Returns the description which can be used as a prompt for image_set-cover to generate a cover image.",
    enhanceSeriesInputSchema.shape,
    async (input: unknown) => {
      try {
        const { seriesId } = enhanceSeriesInputSchema.parse(input);

        // Try to find series by ID or construct ID from slug
        let series: Series | null =
          (await context.entityService.getEntity<Series>("series", seriesId)) ??
          null;

        // If not found, try with series- prefix
        if (!series && !seriesId.startsWith("series-")) {
          series =
            (await context.entityService.getEntity<Series>(
              "series",
              `series-${seriesId}`,
            )) ?? null;
        }

        // If still not found, try by slug in metadata
        if (!series) {
          const allSeries =
            await context.entityService.listEntities<Series>("series");
          series =
            allSeries.find(
              (s) =>
                s.metadata.slug === seriesId ||
                s.metadata.slug === slugify(seriesId),
            ) ?? null;
        }

        if (!series) {
          return {
            success: false,
            error: `Series not found: ${seriesId}`,
          };
        }

        // Get all posts in this series
        const allPosts =
          await context.entityService.listEntities<BlogPost>("post");
        const seriesPosts = allPosts.filter(
          (p) => p.metadata.seriesName === series.metadata.title,
        );

        if (seriesPosts.length === 0) {
          return {
            success: false,
            error: `No posts found in series: ${series.metadata.title}`,
          };
        }

        // Build context from posts (titles and excerpts)
        const postSummaries = seriesPosts
          .map((post) => {
            const parsed = parseMarkdownWithFrontmatter(
              post.content,
              blogPostFrontmatterSchema,
            );
            const title = parsed.metadata.title;
            const excerpt = parsed.metadata.excerpt;
            return `- "${title}": ${excerpt}`;
          })
          .join("\n");

        const prompt = `Series name: ${series.metadata.title}

Posts in this series:
${postSummaries}`;

        // Generate description using AI
        const generated = await context.ai.generate<{ description: string }>({
          prompt,
          templateName: "blog:series-description",
        });

        // Update series with new description
        const existingFrontmatter = parseMarkdownWithFrontmatter(
          series.content,
          seriesFrontmatterSchema,
        );

        // Build updated content with description in frontmatter
        const updatedContent = seriesAdapter.toMarkdown({
          ...series,
          metadata: {
            ...series.metadata,
            description: generated.description,
          },
        });

        // Preserve coverImageId if it exists
        let finalContent = updatedContent;
        if (existingFrontmatter.metadata.coverImageId) {
          // Re-parse and add coverImageId back
          const parsed = parseMarkdownWithFrontmatter(
            updatedContent,
            seriesFrontmatterSchema.partial(),
          );
          const frontmatterWithCover = {
            ...parsed.metadata,
            coverImageId: existingFrontmatter.metadata.coverImageId,
          };
          const { generateMarkdownWithFrontmatter } = await import(
            "@brains/plugins"
          );
          finalContent = generateMarkdownWithFrontmatter(
            parsed.content,
            frontmatterWithCover,
          );
        }

        await context.entities.update({
          ...series,
          content: finalContent,
          contentHash: computeContentHash(finalContent),
          metadata: {
            ...series.metadata,
            description: generated.description,
          },
          updated: new Date().toISOString(),
        });

        return {
          success: true,
          data: {
            seriesId: series.id,
            seriesName: series.metadata.title,
            description: generated.description,
            postCount: seriesPosts.length,
          },
          message: `Series "${series.metadata.title}" enhanced with description. Use image_set-cover with generate:true and prompt:"${generated.description}" to generate a cover image.`,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: msg,
        };
      }
    },
  );
}
