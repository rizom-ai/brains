import {
  atprotoProvenance,
  canonicalAtprotoLexicons,
} from "@brains/atproto-contracts";
import type { AtprotoBrainSocialPostRecord } from "@brains/atproto-contracts";
import type {
  EntityAtprotoProjection,
  EntityAtprotoRecordInput,
  EntityDefinition,
  EntityOf,
} from "@brains/sdk/entities";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import type { socialPostMetadataSchema } from "./schemas/social-post";

type SocialPostRecord = EntityOf<
  EntityDefinition<"social-post", typeof socialPostMetadataSchema>
>;

/** A social post as its ai.rizom.brain.socialPost record: its fields and its text. */
export async function buildSocialPostAtprotoRecord({
  entity,
  config,
  pageUrl,
}: EntityAtprotoRecordInput<SocialPostRecord>): Promise<AtprotoBrainSocialPostRecord> {
  const { metadata } = entity;
  return {
    $type: "ai.rizom.brain.socialPost",
    title: metadata.title,
    platform: metadata.platform,
    body: parseMarkdown(entity.content).content,
    format: "text/markdown",
    status: metadata.status,
    ...(metadata.publishedAt && { publishedAt: metadata.publishedAt }),
    ...(metadata.platformPostId && {
      platformPostId: metadata.platformPostId,
    }),
    ...(metadata.sourceEntityType && {
      sourceLocalEntityType: metadata.sourceEntityType,
    }),
    ...(metadata.sourceEntityId && {
      sourceLocalEntityId: metadata.sourceEntityId,
    }),
    ...atprotoProvenance({ config, pageUrl }, entity),
  };
}

/** Social post records go out unvalidated, under the canonical social post lexicon. */
export const socialPostAtproto: EntityAtprotoProjection<SocialPostRecord> = {
  lexicon: canonicalAtprotoLexicons["ai.rizom.brain.socialPost"],
  validate: false,
  buildRecord: buildSocialPostAtprotoRecord,
};
