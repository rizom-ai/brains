/**
 * Social media package.
 *
 * A `social-post` entity to store what gets written, plus the work of
 * actually publishing one — which needs LinkedIn credentials and so belongs
 * to the service half of the package rather than to the entity.
 */

import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { socialMediaConfigSchema } from "./config";
import { socialPost } from "./social-post-entity";
import { createLinkedInProvider } from "./lib/linkedin-client";

const socialMediaPackage: ServicePackageDefinition<
  typeof socialMediaConfigSchema
> = defineServicePlugin({
  id: "publishing",
  config: socialMediaConfigSchema,
  entities: [socialPost],
  // No credentials, no provider: the publish pipeline is told about
  // LinkedIn only when this brain can actually reach it.
  publish: ({ config, logger }) => {
    const linkedin = config.linkedin;
    return linkedin?.accessToken
      ? [
          {
            entityType: "social-post",
            provider: createLinkedInProvider(linkedin, logger),
            resultIdField: "platformPostId",
          },
        ]
      : [];
  },
});

export default socialMediaPackage;

export { socialPost } from "./social-post-entity";

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

// Adapter exports
export {
  socialPostAdapter,
  SocialPostAdapter,
} from "./adapters/social-post-adapter";

export {
  buildSocialPostAtprotoRecord,
  createSocialPostAtprotoProjection,
} from "./atproto-projection";

// DataSource exports
export { socialPostDataSource } from "./datasources/social-post-datasource";

// Handler exports
export {
  socialPostGeneration,
  generationJobSchema,
  type GenerationJobData,
} from "./handlers/generationHandler";

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
  getTemplateName,
  SocialPostListTemplate,
  type SocialPostListProps,
  SocialPostDetailTemplate,
  type SocialPostDetailProps,
} from "./templates";
