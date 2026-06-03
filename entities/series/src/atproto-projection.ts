import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";
import type {
  AtprotoBrainSeriesRecord,
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";
import { seriesAdapter } from "./adapters/series-adapter";
import { seriesSchema } from "./schemas/series";

export async function buildSeriesAtprotoRecord({
  entity,
  config,
}: AtprotoProjectionBuildInput): Promise<AtprotoBrainSeriesRecord> {
  const series = seriesSchema.parse(entity);
  const body = seriesAdapter.parseBody(series.content);

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
