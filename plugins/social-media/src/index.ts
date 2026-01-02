// Main exports
export { SocialMediaPlugin, socialMediaPlugin } from "./plugin";

// Config exports
export {
  socialMediaConfigSchema,
  linkedinConfigSchema,
  type SocialMediaConfig,
  type SocialMediaConfigInput,
  type LinkedinConfig,
} from "./config";

// Schema exports
export {
  socialPostSchema,
  socialPostFrontmatterSchema,
  socialPostMetadataSchema,
  socialPostWithDataSchema,
  platformSchema,
  socialPostStatusSchema,
  sourceEntityTypeSchema,
  type SocialPost,
  type SocialPostFrontmatter,
  type SocialPostMetadata,
  type SocialPostWithData,
  type Platform,
  type SocialPostStatus,
  type SourceEntityType,
} from "./schemas/social-post";

// Adapter exports
export {
  socialPostAdapter,
  SocialPostAdapter,
} from "./adapters/social-post-adapter";

// DataSource exports
export { SocialPostDataSource } from "./datasources/social-post-datasource";

// Tool exports
export {
  createGenerateTool,
  createQueueTool,
  createPublishTool,
  createEditTool,
  generateInputSchema,
  queueInputSchema,
  publishInputSchema,
  editInputSchema,
  type GenerateInput,
  type QueueInput,
  type PublishInput,
  type EditInput,
} from "./tools";

// Handler exports
export {
  GenerationJobHandler,
  generationJobSchema,
  type GenerationJobData,
  PublishExecuteHandler,
  type PublishExecuteHandlerConfig,
  type PublishExecutePayload,
} from "./handlers";

// Provider exports
export type { SocialMediaProvider, CreatePostResult } from "./lib/provider";
export { LinkedInClient, createLinkedInProvider } from "./lib/linkedin-client";

// Template exports
export {
  linkedinTemplate,
  linkedinPostSchema,
  type LinkedInPost,
  getTemplateName,
} from "./templates";
