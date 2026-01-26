import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import {
  createTool,
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import { z, slugify, computeContentHash } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";
import { blogPostFrontmatterSchema } from "../schemas/blog-post";
import type { Series } from "../schemas/series";
import {
  seriesFrontmatterSchema,
  createSeriesBodyFormatter,
} from "../schemas/series";

/**
 * Input schema for blog_enhance-series tool
 */
export const enhanceSeriesInputSchema = z.object({
  seriesId: z.string().describe("Series ID or slug (e.g., 'my-series')"),
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

        // Try to find series by ID (which is the slug)
        let series: Series | null =
          (await context.entityService.getEntity<Series>("series", seriesId)) ??
          null;

        // If not found, try slugifying the input
        if (!series) {
          const slugifiedId = slugify(seriesId);
          if (slugifiedId !== seriesId) {
            series =
              (await context.entityService.getEntity<Series>(
                "series",
                slugifiedId,
              )) ?? null;
          }
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

        if (!generated.description) {
          return {
            success: false,
            error: "Failed to generate description",
          };
        }

        // Parse existing frontmatter and generate new body with description
        const parsed = parseMarkdownWithFrontmatter(
          series.content,
          seriesFrontmatterSchema,
        );

        // Generate structured content body with description
        const formatter = createSeriesBodyFormatter(series.metadata.title);
        const newBody = formatter.format({
          description: generated.description,
        });

        const finalContent = generateMarkdownWithFrontmatter(
          newBody,
          parsed.metadata,
        );

        await context.entities.update({
          ...series,
          content: finalContent,
          contentHash: computeContentHash(finalContent),
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
          message: `Series "${series.metadata.title}" enhanced with description. Use image_generate with prompt:"${generated.description}", title:"${series.metadata.title} Cover", targetEntityType:"series", targetEntityId:"${series.id}" to generate a cover image.`,
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
