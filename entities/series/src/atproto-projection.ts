import {
  atprotoProvenance,
  defineAtprotoProjection,
} from "@brains/atproto-contracts";
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
  pageUrl,
}: AtprotoProjectionBuildInput): Promise<AtprotoBrainSeriesRecord> {
  const series = seriesSchema.parse(entity);
  const body = seriesAdapter.parseBody(series.content);

  return {
    $type: "ai.rizom.brain.series",
    title: series.metadata.title,
    slug: series.metadata.slug,
    ...(body.description && { description: body.description }),
    ...atprotoProvenance({ config, pageUrl }, series),
  };
}

export function createSeriesAtprotoProjection(): AtprotoProjection<AtprotoBrainSeriesRecord> {
  return defineAtprotoProjection({
    entityType: "series",
    collection: "ai.rizom.brain.series",
    buildRecord: buildSeriesAtprotoRecord,
  });
}
