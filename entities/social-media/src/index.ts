import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { loggedProvider } from "@brains/sdk/internal/entity-runtime";
import { socialMediaConfigSchema } from "./config";
import { socialPostDataSource } from "./datasources/social-post-datasource";
import { createLinkedInProvider } from "./lib/linkedin-client";
import { createSocialPostProjectionRule } from "./lib/social-post-projection";
import { socialPost } from "./social-post";

/**
 * The social media posts: one entity, a social post, rendered through the
 * social post data source. With a LinkedIn access token configured, posts
 * publish to LinkedIn through the publish pipeline; with
 * `autoGenerateOnBlogPublish`, each queued blog post gets a LinkedIn draft.
 */
export const socialMediaPackage: EntityPackageDefinition<
  readonly [typeof socialPost],
  readonly [],
  typeof socialMediaConfigSchema
> = defineEntityPackage({
  id: "social-media",
  config: socialMediaConfigSchema,
  entities: [socialPost],
  dataSources: [socialPostDataSource(socialPost)],
  configure: ({ config }) => {
    const linkedin = config.linkedin;
    return {
      entities: [
        {
          entity: socialPost,
          ...(linkedin?.accessToken && {
            publish: {
              provider: loggedProvider("linkedin", (logger) =>
                createLinkedInProvider(
                  linkedin,
                  logger.child("LinkedInClient"),
                ),
              ),
              resultIdField: "platformPostId",
            },
          }),
          ...(config.autoGenerateOnBlogPublish && {
            projectionRules: ({ template }) => [
              createSocialPostProjectionRule(template("linkedin")),
            ],
          }),
        },
      ],
    };
  },
});

export default socialMediaPackage;

export { socialPost } from "./social-post";

// Config exports
export {
  socialMediaConfigSchema,
  linkedinConfigSchema,
  type SocialMediaConfig,
  type SocialMediaConfigInput,
  type LinkedinConfig,
  type LinkedinConfigInput,
} from "./config";

// Schema exports
export {
  socialPostSchema,
  socialPostFrontmatterSchema,
  socialPostMetadataSchema,
  socialPostWithDataSchema,
  enrichedSocialPostSchema,
  platformSchema,
  socialPostStatusSchema,
  sourceEntityTypeSchema,
  socialPostDocumentAttachmentSchema,
  type SocialPost,
  type SocialPostFrontmatter,
  type SocialPostMetadata,
  type SocialPostWithData,
  type EnrichedSocialPost,
  type Platform,
  type SocialPostStatus,
  type SourceEntityType,
  type SocialPostDocumentAttachment,
} from "./schemas/social-post";

export {
  socialPostDocument,
  socialPostMarkdown,
  socialPostWithData,
} from "./lib/social-post-markdown";

export {
  buildSocialPostAtprotoRecord,
  socialPostAtproto,
} from "./atproto-projection";

export { socialPostDataSource } from "./datasources/social-post-datasource";

export {
  socialPostGeneration,
  generationJobSchema,
  socialMediaGenerationResultSchema,
  type GenerationJobData,
  type GenerationResult,
} from "./generation";

// Provider exports (uses PublishProvider from @brains/contracts)
export {
  LinkedInClient,
  createLinkedInProvider,
  type LinkedInClientDeps,
} from "./lib/linkedin-client";

// Template exports
export {
  linkedinTemplate,
  linkedinPostSchema,
  type LinkedInPost,
} from "./templates/linkedin-template";
export {
  SocialPostListTemplate,
  type SocialPostListProps,
} from "./templates/social-post-list";
export {
  SocialPostDetailTemplate,
  type SocialPostDetailProps,
} from "./templates/social-post-detail";
