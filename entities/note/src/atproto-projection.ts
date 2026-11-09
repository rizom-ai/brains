import {
  atprotoProvenance,
  canonicalAtprotoLexicons,
} from "@brains/atproto-contracts";
import type { AtprotoBrainNoteRecord } from "@brains/atproto-contracts";
import type {
  EntityAtprotoProjection,
  EntityAtprotoRecordInput,
  EntityDefinition,
  EntityOf,
} from "@brains/sdk/entities";
import type { noteMetadataSchema } from "./schemas/note";

type NoteRecord = EntityOf<EntityDefinition<"note", typeof noteMetadataSchema>>;

/** A note as its ai.rizom.brain.note record: its title and its body. */
export async function buildNoteAtprotoRecord({
  entity,
  config,
  pageUrl,
}: EntityAtprotoRecordInput<NoteRecord>): Promise<AtprotoBrainNoteRecord> {
  return {
    $type: "ai.rizom.brain.note",
    title: entity.metadata.title,
    body: entity.content,
    format: "text/markdown",
    ...atprotoProvenance({ config, pageUrl }, entity),
  };
}

/** Note records go out unvalidated, under the canonical note lexicon. */
export const noteAtproto: EntityAtprotoProjection<NoteRecord> = {
  lexicon: canonicalAtprotoLexicons["ai.rizom.brain.note"],
  validate: false,
  buildRecord: buildNoteAtprotoRecord,
};
