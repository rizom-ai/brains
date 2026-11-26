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
import { storedDocumentParts } from "@brains/contracts";
import { bookFrontmatterSchema, type bookMetadataSchema } from "./schemas/book";

type BookRecord = EntityOf<EntityDefinition<"book", typeof bookMetadataSchema>>;

/**
 * A book as its ai.rizom.brain.book record: what the book is and where its
 * page is, never its text, which is in its sections. A book's metadata
 * indexes its title alone, so its author, edition and license are read
 * from its file's header; what the header does not state is left out.
 */
export async function buildBookAtprotoRecord({
  entity,
  config,
  pageUrl,
  storedDocument,
}: EntityAtprotoRecordInput<BookRecord>): Promise<AtprotoBrainBookRecord> {
  const stated = bookFrontmatterSchema
    .partial()
    .safeParse(storedDocumentParts(await storedDocument()).header).data;
  return {
    $type: "ai.rizom.brain.book",
    title: entity.metadata.title,
    ...(stated?.author && { author: stated.author }),
    ...(typeof stated?.year === "number" && { year: stated.year }),
    ...(stated?.kind && { kind: stated.kind }),
    ...(stated?.edition && { edition: stated.edition }),
    ...(stated?.license && { license: stated.license }),
    ...(stated?.attribution && { attribution: stated.attribution }),
    ...(stated?.source && { source: stated.source }),
    ...atprotoProvenance({ config, pageUrl }, entity),
  };
}

/** Book records go out unvalidated, under the canonical book lexicon. */
export const bookAtproto: EntityAtprotoProjection<BookRecord> = {
  lexicon: canonicalAtprotoLexicons["ai.rizom.brain.book"],
  validate: false,
  buildRecord: buildBookAtprotoRecord,
};
