import { createSiteContentPackage } from "./plugin";

export { createSiteContentPackage } from "./plugin";
export { createSiteContentTemplates } from "./lib/site-content-definitions";
export type { SiteContent, SiteContentMetadata } from "./schemas/site-content";
export {
  siteContentEntity,
  siteContentMetadataSchema,
} from "./schemas/site-content";
export {
  siteContentPluginConfigSchema,
  type SiteContentPluginConfig,
  type SiteContentPluginConfigInput,
} from "./schemas/config";
export type {
  SiteContentDefinition,
  SiteContentFieldDefinition,
  SiteContentSectionDefinition,
} from "./definitions";

/** The site's content sections as a brain composes them. */
const siteContentPackage: ReturnType<typeof createSiteContentPackage> =
  createSiteContentPackage();
export default siteContentPackage;
