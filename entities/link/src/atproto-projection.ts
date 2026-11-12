import {
  atprotoProvenance,
  canonicalAtprotoLexicons,
} from "@brains/atproto-contracts";
import type { AtprotoBrainLinkRecord } from "@brains/atproto-contracts";
import type {
  EntityAtprotoProjection,
  EntityAtprotoRecordInput,
  EntityDefinition,
  EntityOf,
} from "@brains/sdk/entities";
import { linkSummary } from "./lib/link-markdown";
import type { linkMetadataSchema } from "./schemas/link";

type LinkRecord = EntityOf<EntityDefinition<"link", typeof linkMetadataSchema>>;

/** A link as its ai.rizom.brain.link record: its fields and its summary. */
export async function buildLinkAtprotoRecord({
  entity,
  config,
  pageUrl,
}: EntityAtprotoRecordInput<LinkRecord>): Promise<AtprotoBrainLinkRecord> {
  const { metadata } = entity;
  const summary = linkSummary(entity.content);
  return {
    $type: "ai.rizom.brain.link",
    title: metadata.title,
    url: metadata.url,
    ...(metadata.description && { description: metadata.description }),
    ...(summary && { summary }),
    domain: new URL(metadata.url).hostname,
    capturedAt: metadata.capturedAt,
    source: metadata.source,
    ...atprotoProvenance({ config, pageUrl }, entity),
  };
}

/** Link records go out unvalidated, under the canonical link lexicon. */
export const linkAtproto: EntityAtprotoProjection<LinkRecord> = {
  lexicon: canonicalAtprotoLexicons["ai.rizom.brain.link"],
  validate: false,
  buildRecord: buildLinkAtprotoRecord,
};
