import { blogPostFrontmatterSchema } from "./schemas/blog-post";
import { defineEntity, z, type EntityDefinition } from "@brains/sdk/entities";
import {
  createTemplate,
  paginationInfoSchema,
} from "@brains/sdk/internal/presentation";
import {
  restatingMetadata,
  withFrontmatterSchema,
} from "@brains/sdk/internal/entity-runtime";
import { postAtproto } from "./atproto-projection";
import { createBlogOgImageProvider } from "./attachments/og-image-provider";
import {
  BLOG_OG_IMAGE_ATTACHMENT_TYPE,
  blogOgImageTemplate,
} from "./attachments/og-image-template";
import { createBlogPrintableProvider } from "./attachments/printable-provider";
import {
  BLOG_PRINTABLE_ATTACHMENT_TYPE,
  blogPrintableTemplate,
} from "./attachments/printable-template";
import { postFeed } from "./feed";
import { postGeneration } from "./generation";
import { postFromText } from "./lib/create-from-text";
import { postEvals } from "./lib/eval-handlers";
import { postMarkdown, postStub } from "./lib/post-markdown";
import { blogPostMetadataSchema } from "./schemas/blog-post";
import { BlogListTemplate, type BlogListProps } from "./templates/blog-list";
import { BlogPostTemplate, type BlogPostProps } from "./templates/blog-post";
import { blogRenderSchema, blogViewSchema } from "./templates/blog-view-schema";
import { blogExcerptTemplate } from "./templates/excerpt-template";
import { blogGenerationTemplate } from "./templates/generation-template";
import { homepageTemplate } from "./templates/homepage";

const POST_INSTRUCTIONS =
  'Saving an essay the user supplies as a post, or turning a note into a post ("turn my note X into a post": source.kind entity), is system_create: the text is kept, a leading # heading becomes the title, and the brain adds the excerpt and author. If the user says the essay was already published, pass fields { status: "published", publishedAt: "YYYY-MM-DD", canonicalUrl } with what they state.';

/**
 * Datasources return posts before site-builder adds route/display fields.
 * Keep those enrichment fields optional here; createTemplate casts to the
 * fully enriched component props after the site-builder enrichment pass.
 */
const postListRenderSchema = z.object({
  posts: z.array(blogRenderSchema),
  pageTitle: z.string().nullable().default(null),
  pageLabel: z.string().nullable().default(null),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().nullable().default(null),
});

const postDetailRenderSchema = z.object({
  post: blogRenderSchema,
  prevPost: blogRenderSchema.nullable(),
  nextPost: blogRenderSchema.nullable(),
  seriesPosts: z.array(blogRenderSchema).nullable(),
});

const postListSchema = z.object({
  posts: z.array(blogViewSchema),
  pageTitle: z.string().nullable().default(null),
  pageLabel: z.string().nullable().default(null),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().nullable().default(null),
});

const postDetailSchema = z.object({
  post: blogViewSchema,
  prevPost: blogViewSchema.nullable(),
  nextPost: blogViewSchema.nullable(),
  seriesPosts: z.array(blogViewSchema).nullable(),
});

/**
 * A blog post: its body the essay, its frontmatter its metadata. It is
 * written from the writer's text, its excerpt and author filled in by its
 * own generation, or generated from a prompt; rendered on the site and in
 * its feed, as a printable and a social card the publish pipeline renders
 * before it goes out, published by the site itself, and as an
 * ai.rizom.brain.post record once published. Once stored, its file states
 * its slug, resolved or not, so later writes put it where a stated slug
 * goes, as the blog post adapter wrote it.
 */
export const post: EntityDefinition<"post", typeof blogPostMetadataSchema> =
  withFrontmatterSchema(
    restatingMetadata(
      defineEntity({
        type: "post",
        purpose:
          "A long-form published article, essay, or blog post written for an audience.",
        instructions: POST_INSTRUCTIONS,
        metadata: blogPostMetadataSchema,
        markdown: postMarkdown,
        config: {
          weight: 2.0,
          defaultSort: [{ field: "publishedAt", direction: "desc" }],
          projectionSourceRole: "primary",
          publish: { publishStatuses: ["queued", "published"] },
          // Read by nothing: not the head, the site, nor ATProto.
          retiredFields: ["ogDescription", "twitterCard", "atprotoUri"],
        },
        coverImage: true,
        stub: postStub,
        templates: {
          "post-list": createTemplate<
            z.output<typeof postListSchema>,
            BlogListProps
          >({
            name: "post-list",
            description: "Blog list page template",
            schema: postListSchema,
            dataSourceId: "blog:entities",
            requiredPermission: "public",
            layout: {
              component: BlogListTemplate,
              renderSchema: postListRenderSchema,
            },
          }),
          "post-detail": createTemplate<
            z.output<typeof postDetailSchema>,
            BlogPostProps
          >({
            name: "post-detail",
            description: "Individual blog post template",
            schema: postDetailSchema,
            dataSourceId: "blog:entities",
            requiredPermission: "public",
            layout: {
              component: BlogPostTemplate,
              renderSchema: postDetailRenderSchema,
            },
          }),
          homepage: homepageTemplate,
          generation: blogGenerationTemplate,
          excerpt: blogExcerptTemplate,
          "og-image": blogOgImageTemplate,
          printable: blogPrintableTemplate,
        },
        create: { fromContent: postFromText },
        generation: postGeneration,
        attachments: [
          {
            type: BLOG_PRINTABLE_ATTACHMENT_TYPE,
            provider: (context) => createBlogPrintableProvider(context),
          },
          {
            type: BLOG_OG_IMAGE_ATTACHMENT_TYPE,
            provider: (context) => createBlogOgImageProvider(context),
          },
        ],
        // Posts publish to the site itself, so the provider records the
        // outcome and nothing more; the social card is rendered first.
        publish: {
          provider: {
            name: "internal",
            publish: async (): Promise<{ id: string }> => ({ id: "internal" }),
          },
        },
        publishAssets: [
          {
            attachmentType: BLOG_OG_IMAGE_ATTACHMENT_TYPE,
            field: "ogImageId",
            requiredWhen: { status: "published" },
          },
        ],
        feed: postFeed,
        atproto: postAtproto,
        evals: postEvals,
      }),
      (stored) => ({ ...stored, authoredSlug: true }),
    ),
    blogPostFrontmatterSchema,
  );
