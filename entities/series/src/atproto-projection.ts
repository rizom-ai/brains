import { canonicalAtprotoLexicons } from "@brains/sdk/entities";
import type {
  AtprotoBrainSeriesRecord,
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/sdk/entities";

import { parseSeriesBody, seriesSchema } from "./schemas/series";

export async function buildSeriesAtprotoRecord({
  entity,
  config,
}: AtprotoProjectionBuildInput): Promise<AtprotoBrainSeriesRecord> {
  const series = seriesSchema.parse(entity);
  const body = parseSeriesBody(series.content);

  return {
    $type: "ai.rizom.brain.series",
    title: series.metadata.title,
    slug: series.metadata.slug,
    ...(body.description && { description: body.description }),
    ...(config.brainDid && { brainDid: config.brainDid }),
    ...(config.anchorDid && { anchorDid: config.anchorDid }),
    sourceEntityType: "series",
    sourceEntityId: series.id,
    createdAt: series.created,
    ...(series.updated && { updatedAt: series.updated }),
  };
}

export function createSeriesAtprotoProjection(): AtprotoProjection<AtprotoBrainSeriesRecord> {
  return {
    entityType: "series",
    collection: "ai.rizom.brain.series",
    lexicon: canonicalAtprotoLexicons["ai.rizom.brain.series"],
    validate: false,
    buildRecord: buildSeriesAtprotoRecord,
  };
}
