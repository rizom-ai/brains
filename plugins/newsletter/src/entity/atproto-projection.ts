import {
  atprotoProvenance,
  canonicalAtprotoLexicons,
} from "@brains/atproto-contracts";
import type { AtprotoBrainNewsletterRecord } from "@brains/atproto-contracts";
import type {
  EntityAtprotoProjection,
  EntityAtprotoRecordInput,
  EntityDefinition,
  EntityOf,
} from "@brains/sdk/entities";
import type { newsletterMetadataSchema } from "./schemas/newsletter";

type NewsletterRecord = EntityOf<
  EntityDefinition<"newsletter", typeof newsletterMetadataSchema>
>;

/** An issue as its ai.rizom.brain.newsletter record: its subject, when it went out, and its text. */
export async function buildNewsletterAtprotoRecord({
  entity,
  config,
  pageUrl,
}: EntityAtprotoRecordInput<NewsletterRecord>): Promise<AtprotoBrainNewsletterRecord> {
  const { metadata } = entity;
  return {
    $type: "ai.rizom.brain.newsletter",
    title: metadata.subject,
    body: entity.content,
    format: "text/markdown",
    ...(metadata.sentAt && { sentAt: metadata.sentAt }),
    ...atprotoProvenance({ config, pageUrl }, entity),
  };
}

/**
 * Newsletter records go out unvalidated, under the canonical newsletter
 * lexicon, once the issue is sent.
 */
export const newsletterAtproto: EntityAtprotoProjection<NewsletterRecord> = {
  lexicon: canonicalAtprotoLexicons["ai.rizom.brain.newsletter"],
  validate: false,
  isPublishable: (entity) => entity.metadata.status === "published",
  buildRecord: buildNewsletterAtprotoRecord,
};
