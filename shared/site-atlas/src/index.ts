/**
 * The atlas site kit: what every atlas site renders around its map.
 *
 * A site supplies its own map loader that fills the atlas contract; the kit
 * draws the terrain, names the territories, places the marks, and floats the
 * authored opening, the Ask box and the contact door over them.
 */
export { HomepageAtlas, type SuppliedMap } from "./templates/homepage-atlas";
export { homepageAtlasStyles } from "./templates/homepage-atlas-styles";
export { sampleGrid, traceContours, type ContourGrid } from "./lib/contours";
export {
  HOMEPAGE_ATLAS_SCRIPT,
  HOMEPAGE_ATLAS_SCRIPT_PATH,
} from "./templates/homepage-atlas-script";
export {
  atlasEntityTypeSchema,
  atlasItemSchema,
  atlasZoneSchema,
  homepageAtlasSchema,
  type AtlasItem,
  type AtlasZone,
  type HomepageAtlasData,
} from "./schemas/homepage-atlas";
export {
  homepageOpeningSchema,
  type HomepageOpeningContent,
} from "./schemas/homepage-opening";
export {
  loadHomepageOpening,
  type HomepageOpeningData,
} from "./datasources/homepage-opening";
export { homepageChatAvailable } from "./datasources/homepage-chat";
export { SiteLayout, type SiteLayoutProps } from "./layouts/SiteLayout";
