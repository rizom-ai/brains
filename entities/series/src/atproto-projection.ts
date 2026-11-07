import {
  atprotoProvenance,
  canonicalAtprotoLexicons,
} from "@brains/atproto-contracts";
import type { AtprotoBrainSeriesRecord } from "@brains/atproto-contracts";
import type {
  EntityAtprotoProjection,
  EntityAtprotoRecordInput,
  EntityOf,
  EntityDefinition,
} from "@brains/sdk/entities";
import { parseSeriesBody, type seriesMetadataSchema } from "./schemas/series";

type SeriesRecord = EntityOf<
  EntityDefinition<"series", typeof seriesMetadataSchema>
>;

/** A series as its ai.rizom.brain.series record. */
export async function buildSeriesAtprotoRecord({
  entity,
  config,
  pageUrl,
}: EntityAtprotoRecordInput<SeriesRecord>): Promise<AtprotoBrainSeriesRecord> {
  const body = parseSeriesBody(entity.metadata.title, entity.content);

  return {
    $type: "ai.rizom.brain.series",
    title: entity.metadata.title,
    slug: entity.metadata.slug,
    ...(body.description && { description: body.description }),
    ...atprotoProvenance({ config, pageUrl }, entity),
  };
}

/** Series records go out unvalidated, under the canonical series lexicon. */
export const seriesAtproto: EntityAtprotoProjection<SeriesRecord> = {
  lexicon: canonicalAtprotoLexicons["ai.rizom.brain.series"],
  validate: false,
  buildRecord: buildSeriesAtprotoRecord,
};
