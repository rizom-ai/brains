import type { JobHandler } from "@brains/job-queue";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z, slugify } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import { ProfileAdapter } from "@brains/profile-service";
import type { BlogPostFrontmatter, BlogPost } from "../schemas/blog-post";

/**
 * Input schema for blog generation job
 */
export const blogGenerationJobSchema = z.object({
  prompt: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  excerpt: z.string().optional(),
  coverImage: z.string().optional(),
  seriesName: z.string().optional(),
  seriesIndex: z.number().optional(),
});

export type BlogGenerationJobData = z.infer<typeof blogGenerationJobSchema>;

/**
 * Result schema for blog generation job
 */
export const blogGenerationResultSchema = z.object({
  success: z.boolean(),
  entityId: z.string().optional(),
  title: z.string().optional(),
  slug: z.string().optional(),
  error: z.string().optional(),
});

export type BlogGenerationResult = z.infer<typeof blogGenerationResultSchema>;

/**
 * Job handler for blog post generation
 * Handles AI-powered content generation and entity creation
 */
export class BlogGenerationJobHandler
  implements
    JobHandler<"generation", BlogGenerationJobData, BlogGenerationResult>
{
  constructor(
    private logger: Logger,
    private context: ServicePluginContext,
  ) {}

  async process(
    data: BlogGenerationJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<BlogGenerationResult> {
    const { prompt, coverImage, seriesName, seriesIndex } = data;
    let { title, content, excerpt } = data;

    try {
      await progressReporter.report({
        progress: 0,
        total: 100,
        message: "Starting blog post generation",
      });

      // Case 1: AI generates everything (title, content, excerpt)
      if (!title || !content) {
        await progressReporter.report({
          progress: 10,
          total: 100,
          message: "Generating blog post content with AI",
        });

        const defaultPrompt =
          "Write an insightful blog post about a topic from my knowledge base that would be valuable to share";
        const finalPrompt = prompt ?? defaultPrompt;

        const generationPrompt = `${finalPrompt}${seriesName ? `\n\nNote: This is part of a series called "${seriesName}".` : ""}`;

        const generated = await this.context.generateContent<{
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

        await progressReporter.report({
          progress: 50,
          total: 100,
          message: `Generated blog post: "${title}"`,
        });
      }
      // Case 2: User provided title+content, but no excerpt - AI generates excerpt
      else if (!excerpt) {
        await progressReporter.report({
          progress: 30,
          total: 100,
          message: "Generating excerpt with AI",
        });

        const excerptGenerated = await this.context.generateContent<{
          excerpt: string;
        }>({
          prompt: `Title: ${title}\n\nContent:\n${content}`,
          templateName: "blog:excerpt",
        });

        excerpt = excerptGenerated.excerpt;

        await progressReporter.report({
          progress: 50,
          total: 100,
          message: "Excerpt generated",
        });
      } else {
        await progressReporter.report({
          progress: 50,
          total: 100,
          message: "Using provided content",
        });
      }

      // Generate slug from title (will be stored in metadata for URL routing)
      await progressReporter.report({
        progress: 60,
        total: 100,
        message: "Creating blog post entity",
      });

      const slug = slugify(title);

      const finalExcerpt = excerpt;

      // Get author from profile entity
      const profile = await this.context.entityService.getEntity(
        "profile",
        "profile",
      );
      if (!profile?.content) {
        return {
          success: false,
          error: "Profile entity not found or invalid",
        };
      }

      // Parse profile content to get name
      const profileAdapter = new ProfileAdapter();
      const profileData = profileAdapter.parseProfileBody(profile.content);
      const author = profileData.name;

      // Handle series indexing
      let finalSeriesIndex = seriesIndex;
      if (seriesName && !seriesIndex) {
        const seriesPosts =
          await this.context.entityService.listEntities<BlogPost>("post");
        const postsInSeries = seriesPosts.filter(
          (p) => p.metadata.seriesName === seriesName && p.metadata.publishedAt,
        );
        finalSeriesIndex = postsInSeries.length + 1;
      }

      await progressReporter.report({
        progress: 80,
        total: 100,
        message: "Saving blog post to database",
      });

      // Create entity with auto-generated ID (nanoid)
      // Store all data in frontmatter, duplicate key fields in metadata for fast queries
      const { blogPostAdapter } = await import("../adapters/blog-post-adapter");

      // Create frontmatter with all post data including slug
      const frontmatter: BlogPostFrontmatter = {
        title,
        slug, // Store slug in frontmatter for user visibility
        status: "draft" as const,
        excerpt: finalExcerpt,
        author,
        ...(coverImage && { coverImage }),
        ...(seriesName && { seriesName }),
        ...(finalSeriesIndex && { seriesIndex: finalSeriesIndex }),
      };

      const postContent = blogPostAdapter.createPostContent(
        frontmatter,
        content,
      );

      // Duplicate key searchable fields in metadata for fast queries (following summary pattern)
      // ID will be auto-generated (nanoid), slug will be used for URL routing
      const result = await this.context.entityService.createEntity({
        entityType: "post",
        content: postContent,
        metadata: {
          title: frontmatter.title,
          slug: frontmatter.slug, // Store slug in metadata for fast lookups
          status: frontmatter.status,
          publishedAt: frontmatter.publishedAt, // undefined for drafts, which is fine
          seriesName: frontmatter.seriesName,
          seriesIndex: frontmatter.seriesIndex,
        },
      });

      await progressReporter.report({
        progress: 100,
        total: 100,
        message: `Blog post "${title}" created successfully`,
      });

      return {
        success: true,
        entityId: result.entityId,
        title,
        slug,
      };
    } catch (error) {
      this.logger.error("Blog generation job failed", {
        error,
        jobId,
        data,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  validateAndParse(data: unknown): BlogGenerationJobData | null {
    try {
      return blogGenerationJobSchema.parse(data);
    } catch (error) {
      this.logger.error("Invalid blog generation job data", { data, error });
      return null;
    }
  }

  async onError(
    error: Error,
    data: BlogGenerationJobData,
    jobId: string,
  ): Promise<void> {
    this.logger.error("Blog generation job error handler triggered", {
      error: error.message,
      jobId,
      prompt: data.prompt,
      title: data.title,
    });
  }
}
