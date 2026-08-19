import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import { slugify } from "@brains/sdk/entities";
import {
  blogPostFrontmatterSchema,
  blogPostMetadataSchema,
} from "./schemas/blog-post";
import { blogPostAdapter } from "./adapters/blog-post-adapter";
import { getTemplates } from "./lib/register-templates";
import {
  blogDataSource,
  blogLatestDataSource,
  blogSeriesDataSource,
} from "./datasources/blog-datasource";
import { createBlogAtprotoProjection } from "./atproto-projection";
import {
  BLOG_PRINTABLE_ATTACHMENT_TYPE,
  createBlogPrintableProvider,
} from "./attachments/printable-provider";
import {
  BLOG_OG_IMAGE_ATTACHMENT_TYPE,
  createBlogOgImageProvider,
} from "./attachments/og-image-provider";
import { postGeneration } from "./handlers/blogGenerationJobHandler";
import { blogEvals } from "./lib/eval-handlers";
import { postToFeedItem } from "./lib/feed";

/**
 * A blog post.
 *
 * Posts weigh above ordinary content in search: a published post is
 * deliberate, edited writing rather than a note to self.
 */
export const post: EntityDefinition<"post", typeof blogPostMetadataSchema> =
  defineEntity({
    type: "post",
    purpose: "A published piece of writing.",
    metadata: blogPostMetadataSchema,
    config: {
      weight: 2.0,
      projectionSourceRole: "primary",
      publish: { publishStatuses: ["queued", "published"] },
    },
    markdown: {
      // Metadata indexes the queryable fields; excerpt, author, the social
      // preview tags and atprotoUri stay in the content's frontmatter and
      // are carried forward on write.
      decode: ({ content, frontmatter }) => {
        const parsed = blogPostFrontmatterSchema.parse(frontmatter);
        return {
          content,
          metadata: {
            title: parsed.title,
            slug: parsed.slug ?? slugify(parsed.title),
            status: parsed.status,
            ...(parsed.publishedAt === undefined
              ? {}
              : { publishedAt: parsed.publishedAt }),
            ...(parsed.seriesName === undefined
              ? {}
              : { seriesName: parsed.seriesName }),
            ...(parsed.seriesIndex === undefined
              ? {}
              : { seriesIndex: parsed.seriesIndex }),
          },
        };
      },
      encode: ({ content, metadata }) => ({
        content,
        frontmatter: {
          title: metadata.title,
          slug: metadata.slug,
          status: metadata.status,
          ...(metadata.publishedAt === undefined
            ? {}
            : { publishedAt: metadata.publishedAt }),
          ...(metadata.seriesName === undefined
            ? {}
            : { seriesName: metadata.seriesName }),
          ...(metadata.seriesIndex === undefined
            ? {}
            : { seriesIndex: metadata.seriesIndex }),
        },
      }),
    },
    // What system_generate persists before the writing starts, so an author
    // sees the post appear immediately rather than after the AI finishes.
    // Excerpt and author are empty rather than absent: they live in the
    // content's frontmatter, which the codec requires in full.
    stub: ({ id, title }) => ({
      content: blogPostAdapter.createPostContent(
        {
          title,
          slug: id,
          status: "generating",
          excerpt: "",
          author: "",
        },
        "",
      ),
      metadata: { title, slug: id, status: "generating" },
    }),
    templates: getTemplates(),
    dataSources: [blogDataSource, blogLatestDataSource, blogSeriesDataSource],
    attachments: [
      {
        type: BLOG_PRINTABLE_ATTACHMENT_TYPE,
        provider: createBlogPrintableProvider,
      },
      {
        type: BLOG_OG_IMAGE_ATTACHMENT_TYPE,
        provider: createBlogOgImageProvider,
      },
    ],
    atproto: createBlogAtprotoProjection(),
    generation: postGeneration,
    evals: blogEvals,
    // A published post needs a social preview image, generated on demand
    // rather than blocking the author.
    publishAssets: [
      {
        attachmentType: BLOG_OG_IMAGE_ATTACHMENT_TYPE,
        mediaEntityType: "image",
        targetEntityField: { location: "frontmatter", field: "ogImageId" },
        requiredWhen: { status: "published" },
        autoGenerate: true,
        jobType: "image:image-render-source",
      },
    ],
    // Posts publish to the site itself, so the provider records the outcome
    // and nothing more.
    publish: {
      provider: {
        name: "internal",
        publish: async (): Promise<{ id: string }> => ({ id: "internal" }),
      },
    },
    feed: {
      path: "feed.xml",
      routePrefix: "posts",
      toItem: postToFeedItem,
    },
  });
