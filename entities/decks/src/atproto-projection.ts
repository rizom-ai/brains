import {
  atprotoProvenance,
  canonicalAtprotoLexicons,
} from "@brains/atproto-contracts";
import type { AtprotoBrainDeckRecord } from "@brains/atproto-contracts";
import type {
  EntityAtprotoProjection,
  EntityAtprotoRecordInput,
  EntityDefinition,
  EntityOf,
} from "@brains/sdk/entities";
import type { deckMetadataSchema } from "./schemas/deck";

type DeckRecord = EntityOf<EntityDefinition<"deck", typeof deckMetadataSchema>>;

/** A deck as its ai.rizom.brain.deck record: its fields and its slides. */
export async function buildDeckAtprotoRecord({
  entity,
  config,
  pageUrl,
}: EntityAtprotoRecordInput<DeckRecord>): Promise<AtprotoBrainDeckRecord> {
  const { metadata } = entity;
  return {
    $type: "ai.rizom.brain.deck",
    title: metadata.title,
    slug: metadata.slug,
    ...(metadata.description && { description: metadata.description }),
    body: entity.content,
    format: "text/markdown",
    ...(metadata.author && { author: metadata.author }),
    ...(metadata.event && { event: metadata.event }),
    ...(metadata.publishedAt && { publishedAt: metadata.publishedAt }),
    ...atprotoProvenance({ config, pageUrl }, entity),
  };
}

/** Deck records go out unvalidated, under the canonical deck lexicon. */
export const deckAtproto: EntityAtprotoProjection<DeckRecord> = {
  lexicon: canonicalAtprotoLexicons["ai.rizom.brain.deck"],
  validate: false,
  buildRecord: buildDeckAtprotoRecord,
};
