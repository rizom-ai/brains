/**
 * Series membership and order, as every package that reads a series agrees
 * on them: the shared contract, re-exported where the series reads it.
 */
export {
  compareBySeriesPosition,
  getSeriesName,
  parseSeriesFields,
  type SeriesSourceFields,
} from "@brains/contracts";
