import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";
import type {
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";
import { seriesAdapter } from "./adapters/series-adapter";
import { seriesSchema } from "./schemas/series";

export interface SeriesAtprotoRecord {
  [key: string]: unknown;
  $type: "ai.rizom.brain.series";
  title: string;
  slug: string;
  description?: string;
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType: "series";
  sourceEntityId: string;
  createdAt: string;
  updatedAt?: string;
}

export async function buildSeriesAtprotoRecord({
  entity,
  config,
}: AtprotoProjectionBuildInput): Promise<SeriesAtprotoRecord> {
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

export function createSeriesAtprotoProjection(): AtprotoProjection<SeriesAtprotoRecord> {
  return {
    entityType: "series",
    collection: "ai.rizom.brain.series",
    lexicon: canonicalAtprotoLexicons["ai.rizom.brain.series"],
    validate: false,
    buildRecord: buildSeriesAtprotoRecord,
  };
}
