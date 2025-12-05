import type { PluginTool, ToolResponse, ToolContext } from "@brains/plugins";
import { z, formatAsEntity } from "@brains/utils";
import { generateRSSFeed, type RSSFeedConfig } from "../rss/feed-generator";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { blogPostFrontmatterSchema } from "../schemas/blog-post";
import type { BlogPost } from "../schemas/blog-post";
import type { BlogPostWithData } from "../datasources/blog-datasource";
import type { ServicePluginContext } from "@brains/plugins";
import { promises as fs } from "fs";

/**
 * Input schema for RSS feed generation
 */
const generateRSSInputSchema = z.object({
  outputPath: z
    .string()
    .describe("Path to write the RSS feed XML file (e.g., './site/feed.xml')"),
  siteUrl: z.string().url().describe("Base URL of the website"),
  title: z.string().describe("RSS feed title"),
  description: z.string().describe("RSS feed description"),
  language: z
    .string()
    .optional()
    .describe("Language code (e.g., 'en-us'). Defaults to 'en-us'"),
  copyright: z.string().optional().describe("Copyright notice"),
  managingEditor: z.string().optional().describe("Managing editor email"),
  webMaster: z.string().optional().describe("Webmaster email"),
});

export type GenerateRSSInput = z.infer<typeof generateRSSInputSchema>;

/**
 * Tool for generating RSS feed
 */
export function createGenerateRSSTool(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}_generate-rss`,
    description:
      "Generate RSS 2.0 feed XML from published blog posts and write to file",
    inputSchema: generateRSSInputSchema.shape,
    visibility: "anchor",

    async handler(
      input: unknown,
      _context: ToolContext,
    ): Promise<ToolResponse> {
      const parsed = generateRSSInputSchema.parse(input);

      // Fetch all published posts
      const allPosts: BlogPost[] = await context.entityService.listEntities(
        "post",
        { limit: 1000 },
      );

      // Filter only published posts and parse frontmatter
      const publishedPosts: BlogPostWithData[] = allPosts
        .filter(
          (p) => p.metadata.status === "published" && p.metadata.publishedAt,
        )
        .map((entity) => {
          const parsedContent = parseMarkdownWithFrontmatter(
            entity.content,
            blogPostFrontmatterSchema,
          );
          return {
            ...entity,
            frontmatter: parsedContent.metadata,
            body: parsedContent.content,
          };
        });

      // Build RSS config
      const rssConfig: RSSFeedConfig = {
        title: parsed.title,
        description: parsed.description,
        link: parsed.siteUrl,
        language: parsed.language ?? "en-us",
        ...(parsed.copyright && { copyright: parsed.copyright }),
        ...(parsed.managingEditor && { managingEditor: parsed.managingEditor }),
        ...(parsed.webMaster && { webMaster: parsed.webMaster }),
      };

      // Generate RSS XML
      const xml = generateRSSFeed(publishedPosts, rssConfig);

      // Ensure output directory exists
      const outputDir = parsed.outputPath.substring(
        0,
        parsed.outputPath.lastIndexOf("/"),
      );
      if (outputDir) {
        await fs.mkdir(outputDir, { recursive: true });
      }

      // Write RSS feed to file
      await fs.writeFile(parsed.outputPath, xml, "utf-8");

      const formatted = formatAsEntity(
        {
          postsCount: publishedPosts.length,
          outputPath: parsed.outputPath,
          title: parsed.title,
        },
        { title: "RSS Feed Generated" },
      );

      return {
        success: true,
        message: `RSS feed generated successfully with ${publishedPosts.length} posts.\nWritten to: ${parsed.outputPath}`,
        data: {
          postsCount: publishedPosts.length,
          outputPath: parsed.outputPath,
        },
        formatted,
      };
    },
  };
}
