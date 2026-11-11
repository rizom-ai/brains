import { socialPostFrontmatterSchema } from "./schemas/social-post";
import { withFrontmatterSchema } from "@brains/sdk/internal/entity-runtime";
import { defineEntity, z, type EntityDefinition } from "@brains/sdk/entities";
import {
  createTemplate,
  paginationInfoSchema,
} from "@brains/sdk/internal/presentation";
import { socialPostAtproto } from "./atproto-projection";
import { socialPostGeneration } from "./generation";
import { socialPostEvals } from "./lib/eval-handlers";
import { socialPostMarkdown, socialPostStub } from "./lib/social-post-markdown";
import { socialPostMetadataSchema } from "./schemas/social-post";
import { linkedinTemplate } from "./templates/linkedin-template";
import {
  SocialPostDetailTemplate,
  type SocialPostDetailProps,
} from "./templates/social-post-detail";
import {
  SocialPostListTemplate,
  type SocialPostListProps,
} from "./templates/social-post-list";
import {
  socialPostRenderSchema,
  socialPostViewSchema,
} from "./templates/social-post-view";

/**
 * What a post looks like once site-builder has filled the link fields the
 * data source leaves null. Components read these as required, so the
 * render path parses against this rather than trusting the enrichment ran.
 */
const postListRenderSchema = z.object({
  posts: z.array(socialPostRenderSchema),
  pageTitle: z.string().optional(),
  pagination: paginationInfoSchema.nullable().optional(),
  baseUrl: z.string().nullable(),
});

const postDetailRenderSchema = z.object({
  post: socialPostRenderSchema,
});

const postListSchema = z.object({
  posts: z.array(socialPostViewSchema),
  totalCount: z.number().nullable().default(null),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().nullable().default(null),
});

const postDetailSchema = z.object({
  post: socialPostViewSchema,
});

/**
 * A social post: its text in the body, its frontmatter its metadata, its
 * slug resolved from its platform and title. It is generated from a
 * prompt, from text, or from a blog post or deck it shares (each published
 * blog post in turn when the content pipeline schedules one), rendered on
 * the site, published to the platform once configured, and as an
 * ai.rizom.brain.socialPost record. The LinkedIn provider and the rule
 * that drafts posts from queued blog posts read the package's config, so
 * the package binds them (configure).
 */
export const socialPost: EntityDefinition<
  "social-post",
  typeof socialPostMetadataSchema
> = withFrontmatterSchema(
  defineEntity({
    type: "social-post",
    purpose: "A short post drafted for social media such as LinkedIn or X.",
    metadata: socialPostMetadataSchema,
    markdown: socialPostMarkdown,
    config: {
      projectionSourceRole: "secondary",
      publish: { publishStatuses: ["queued", "published", "failed"] },
    },
    coverImage: true,
    stub: socialPostStub,
    templates: {
      linkedin: linkedinTemplate,
      "social-post-list": createTemplate<
        z.output<typeof postListSchema>,
        SocialPostListProps
      >({
        name: "social-post-list",
        description: "Social post list page template",
        schema: postListSchema,
        dataSourceId: "social-media:posts",
        requiredPermission: "public",
        layout: {
          component: SocialPostListTemplate,
          renderSchema: postListRenderSchema,
        },
      }),
      "social-post-detail": createTemplate<
        z.output<typeof postDetailSchema>,
        SocialPostDetailProps
      >({
        name: "social-post-detail",
        description: "Individual social post template",
        schema: postDetailSchema,
        dataSourceId: "social-media:posts",
        requiredPermission: "public",
        layout: {
          component: SocialPostDetailTemplate,
          renderSchema: postDetailRenderSchema,
        },
      }),
    },
    generation: socialPostGeneration,
    // Each published blog post in turn, one not yet shared, as the class's
    // scheduled generation picked from the five most recent.
    scheduledGeneration: {
      from: { entityType: "post", status: "published", limit: 5 },
      mode: "each",
    },
    evals: socialPostEvals(() => socialPost),
    atproto: socialPostAtproto,
  }),
  socialPostFrontmatterSchema,
);
