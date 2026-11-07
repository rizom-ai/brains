import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { seriesDataSource } from "./datasources/series-datasource";
import { series } from "./series";

/**
 * Cross-content series: one entity, a series, derived from every entity
 * carrying a `seriesName`, and rendered by the series templates through the
 * series data source.
 */
export const seriesPackage: EntityPackageDefinition<
  readonly [typeof series],
  readonly []
> = defineEntityPackage({
  id: "series",
  entities: [series],
  dataSources: [seriesDataSource],
});

export default seriesPackage;

export { series, type Series } from "./series";
export { seriesDataSource } from "./datasources/series-datasource";
export { buildSeriesAtprotoRecord, seriesAtproto } from "./atproto-projection";
export {
  createSeriesBodyFormatter,
  parseSeriesBody,
  seriesBodySchema,
  seriesFrontmatterSchema,
  seriesListItemSchema,
  seriesMetadataSchema,
  type SeriesBody,
  type SeriesFrontmatter,
  type SeriesListItem,
  type SeriesMetadata,
} from "./schemas/series";
