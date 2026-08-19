import {
  defineEntity,
  generateMarkdownWithFrontmatter,
  type EntityDefinition,
} from "@brains/plugins";
import { slugify } from "@brains/utils/string-utils";
import {
  socialPostCreateFrontmatterSchema,
  socialPostFrontmatterSchema,
  socialPostMetadataSchema,
} from "./schemas/social-post";
import { getTemplates } from "./lib/register-templates";
import { socialPostDataSource } from "./datasources/social-post-datasource";
import { createSocialPostAtprotoProjection } from "./atproto-projection";
import { socialPostGeneration } from "./handlers/generationHandler";
import { socialPostEvals } from "./lib/eval-handlers";

/**
 * A post written for a social platform.
 *
 * Secondary as a projection source: a social post restates something else
 * rather than adding knowledge of its own.
 */
export const socialPost: EntityDefinition<
  "social-post",
  typeof socialPostMetadataSchema
> = defineEntity({
  type: "social-post",
  purpose: "A post written for a social platform.",
  metadata: socialPostMetadataSchema,
  config: {
    projectionSourceRole: "secondary",
    publish: { publishStatuses: ["queued", "published", "failed"] },
  },
  markdown: {
    // The lenient creation schema on the way in, so a direct "save this
    // post" carrying only a title does not fail on missing platform or
    // status. The slug is derived rather than stored.
    decode: ({ content, frontmatter }) => {
      const parsed = socialPostCreateFrontmatterSchema.parse(frontmatter);
      const platform = parsed.platform ?? "linkedin";
      return {
        content,
        metadata: {
          title: parsed.title,
          slug: `${platform}-${slugify(parsed.title)}`,
          platform,
          status: parsed.status ?? "draft",
          ...(parsed.publishedAt === undefined
            ? {}
            : { publishedAt: parsed.publishedAt }),
          ...(parsed.platformPostId === undefined
            ? {}
            : { platformPostId: parsed.platformPostId }),
        },
      };
    },
    encode: ({ content, metadata }) => ({
      content,
      frontmatter: {
        title: metadata.title,
        platform: metadata.platform,
        status: metadata.status,
        ...(metadata.publishedAt === undefined
          ? {}
          : { publishedAt: metadata.publishedAt }),
        ...(metadata.platformPostId === undefined
          ? {}
          : { platformPostId: metadata.platformPostId }),
      },
    }),
  },
  // What system_generate persists before the post is written.
  stub: ({ title }) => ({
    content: generateMarkdownWithFrontmatter("", {
      title,
      platform: "linkedin",
      status: "generating",
    }),
    metadata: {
      title,
      slug: `linkedin-${slugify(title)}`,
      platform: "linkedin",
      status: "generating",
    },
  }),
  templates: getTemplates(),
  dataSources: [socialPostDataSource],
  atproto: createSocialPostAtprotoProjection(),
  generation: socialPostGeneration,
  // Nothing derives social posts automatically. When a schedule asks for
  // one, it promotes a published post that has none yet — long-form writing
  // being what a social post points at.
  scheduledGeneration: {
    from: { entityType: "post", status: "published", limit: 5 },
    mode: "each",
  },
  evals: socialPostEvals,
});

export { socialPostFrontmatterSchema };
