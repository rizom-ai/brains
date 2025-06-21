// Site builder plugin - provides static site generation capabilities
export { SiteBuilderPlugin, siteBuilderPlugin } from "./plugin";
export { PageRegistry } from "./page-registry";
export { LayoutRegistry } from "./layout-registry";
export { builtInLayouts } from "./layout-schemas";
export { SiteBuilder } from "./site-builder";
export type {
  StaticSiteBuilder,
  StaticSiteBuilderOptions,
  StaticSiteBuilderFactory,
} from "./static-site-builder";
export { createAstroBuilder } from "./astro-builder";
