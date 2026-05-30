import { parseAtprotoLexicon } from "@brains/atproto-contracts";
import type {
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";
import { socialPostAdapter } from "./adapters/social-post-adapter";
import { socialPostSchema, type Platform } from "./schemas/social-post";
import socialPostLexicon from "../lexicons/ai.rizom.brain.socialPost.json";

export interface SocialPostAtprotoRecord {
  [key: string]: unknown;
  $type: "ai.rizom.brain.socialPost";
  title: string;
  platform: Platform;
  body: string;
  format: "text/markdown";
  status?: string;
  publishedAt?: string;
  platformPostId?: string;
  sourceLocalEntityType?: string;
  sourceLocalEntityId?: string;
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType: "social-post";
  sourceEntityId: string;
  createdAt: string;
  updatedAt?: string;
}

export async function buildSocialPostAtprotoRecord({
  entity,
  config,
}: AtprotoProjectionBuildInput): Promise<SocialPostAtprotoRecord> {
  const socialPost = socialPostSchema.parse(entity);
  const frontmatter = socialPostAdapter.parsePostFrontmatter(socialPost);
  const body = socialPostAdapter.getPostContent(socialPost);

  return {
    $type: "ai.rizom.brain.socialPost",
    title: frontmatter.title,
    platform: frontmatter.platform,
    body,
    format: "text/markdown",
    status: frontmatter.status,
    ...(frontmatter.publishedAt && { publishedAt: frontmatter.publishedAt }),
    ...(frontmatter.platformPostId && {
      platformPostId: frontmatter.platformPostId,
    }),
    ...(frontmatter.sourceEntityType && {
      sourceLocalEntityType: frontmatter.sourceEntityType,
    }),
    ...(frontmatter.sourceEntityId && {
      sourceLocalEntityId: frontmatter.sourceEntityId,
    }),
    ...(config.brainDid && { brainDid: config.brainDid }),
    ...(config.anchorDid && { anchorDid: config.anchorDid }),
    sourceEntityType: "social-post",
    sourceEntityId: socialPost.id,
    createdAt: socialPost.created,
    ...(socialPost.updated && { updatedAt: socialPost.updated }),
  };
}

export function createSocialPostAtprotoProjection(): AtprotoProjection<SocialPostAtprotoRecord> {
  return {
    entityType: "social-post",
    collection: "ai.rizom.brain.socialPost",
    lexicon: parseAtprotoLexicon(socialPostLexicon),
    validate: false,
    buildRecord: buildSocialPostAtprotoRecord,
  };
}
