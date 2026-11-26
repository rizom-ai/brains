import {
  atprotoProvenance,
  canonicalAtprotoLexicons,
} from "@brains/atproto-contracts";
import type { AtprotoBrainGuideRecord } from "@brains/atproto-contracts";
import type {
  EntityAtprotoProjection,
  EntityAtprotoRecordInput,
  EntityDefinition,
  EntityOf,
} from "@brains/sdk/entities";
import type { guideMetadataSchema } from "./schemas/guide";

type GuideRecord = EntityOf<
  EntityDefinition<"guide", typeof guideMetadataSchema>
>;

/**
 * A guide as its ai.rizom.brain.guide record: who it is for, where it is
 * listed, and its text. Its recipe and material map are how the docs site
 * lays a guide out, and stay with the site.
 */
export async function buildGuideAtprotoRecord({
  entity,
  config,
  pageUrl,
}: EntityAtprotoRecordInput<GuideRecord>): Promise<AtprotoBrainGuideRecord> {
  const { metadata } = entity;
  return {
    $type: "ai.rizom.brain.guide",
    title: metadata.title,
    ...(metadata.summary && { summary: metadata.summary }),
    persona: metadata.persona,
    for: metadata.for,
    ...(metadata.section && { section: metadata.section }),
    order: metadata.order,
    body: entity.content,
    format: "text/markdown",
    ...atprotoProvenance({ config, pageUrl }, entity),
  };
}

/** Guide records go out unvalidated, under the canonical guide lexicon. */
export const guideAtproto: EntityAtprotoProjection<GuideRecord> = {
  lexicon: canonicalAtprotoLexicons["ai.rizom.brain.guide"],
  validate: false,
  buildRecord: buildGuideAtprotoRecord,
};
