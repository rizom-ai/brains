import {
  atprotoProvenance,
  canonicalAtprotoLexicons,
} from "@brains/atproto-contracts";
import type { AtprotoBrainDocRecord } from "@brains/atproto-contracts";
import type {
  EntityAtprotoProjection,
  EntityAtprotoRecordInput,
  EntityDefinition,
  EntityOf,
} from "@brains/sdk/entities";
import type { docMetadataSchema } from "./schemas/doc";

type DocRecord = EntityOf<EntityDefinition<"doc", typeof docMetadataSchema>>;

/** A doc as its ai.rizom.brain.doc record: where it sits in the docs, and its text. */
export async function buildDocAtprotoRecord({
  entity,
  config,
  pageUrl,
}: EntityAtprotoRecordInput<DocRecord>): Promise<AtprotoBrainDocRecord> {
  const { metadata } = entity;
  return {
    $type: "ai.rizom.brain.doc",
    title: metadata.title,
    ...(metadata.description && { description: metadata.description }),
    section: metadata.section,
    order: metadata.order,
    body: entity.content,
    format: "text/markdown",
    ...atprotoProvenance({ config, pageUrl }, entity),
  };
}

/** Doc records go out unvalidated, under the canonical doc lexicon. */
export const docAtproto: EntityAtprotoProjection<DocRecord> = {
  lexicon: canonicalAtprotoLexicons["ai.rizom.brain.doc"],
  validate: false,
  buildRecord: buildDocAtprotoRecord,
};
