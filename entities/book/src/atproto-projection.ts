import {
  atprotoProvenance,
  canonicalAtprotoLexicons,
} from "@brains/atproto-contracts";
import type { AtprotoBrainBookRecord } from "@brains/atproto-contracts";
import type {
  EntityAtprotoProjection,
  EntityAtprotoRecordInput,
  EntityDefinition,
  EntityOf,
} from "@brains/sdk/entities";
import type { bookMetadataSchema } from "./schemas/book";

type BookRecord = EntityOf<EntityDefinition<"book", typeof bookMetadataSchema>>;

/**
 * A book as its ai.rizom.brain.book record: what the book is and where its
 * page is, never its text, which is in its sections. A book's metadata
 * indexes its title alone, so the record names the title; its author,
 * edition and license stay in the file's header, which a projection does
 * not read.
 */
export async function buildBookAtprotoRecord({
  entity,
  config,
  pageUrl,
}: EntityAtprotoRecordInput<BookRecord>): Promise<AtprotoBrainBookRecord> {
  return {
    $type: "ai.rizom.brain.book",
    title: entity.metadata.title,
    ...atprotoProvenance({ config, pageUrl }, entity),
  };
}

/** Book records go out unvalidated, under the canonical book lexicon. */
export const bookAtproto: EntityAtprotoProjection<BookRecord> = {
  lexicon: canonicalAtprotoLexicons["ai.rizom.brain.book"],
  validate: false,
  buildRecord: buildBookAtprotoRecord,
};
