export { SeriesPlugin, seriesPlugin } from "./plugin";
export {
  buildSeriesAtprotoRecord,
  createSeriesAtprotoProjection,
  type SeriesAtprotoRecord,
} from "./atproto-projection";
export {
  seriesSchema,
  seriesFrontmatterSchema,
  seriesMetadataSchema,
  seriesWithDataSchema,
  seriesListItemSchema,
  seriesBodySchema,
  type Series,
  type SeriesFrontmatter,
  type SeriesMetadata,
  type SeriesWithData,
  type SeriesListItem,
  type SeriesBody,
} from "./schemas/series";
export { SeriesAdapter, seriesAdapter } from "./adapters/series-adapter";
