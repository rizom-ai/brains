/**
 * The proximity map's data builder, apart from the pure map composition:
 * it parses agent entities, so it carries the entity runtime that the
 * `./proximity-map` subpath keeps out of site bundles.
 */
export {
  buildProximityMapData,
  type ProximityMapDataContext,
} from "./lib/proximity-map-data";
