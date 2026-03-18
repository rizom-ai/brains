export { PersonalSitePlugin, personalSitePlugin } from "./plugin";
export type { PersonalSiteConfigInput } from "./plugin";
export { routes } from "./routes";
export { HomepageLayout, type HomepageData } from "./templates/homepage";
export { AboutPageLayout, type AboutPageData } from "./templates/about";
export { HomepageDataSource } from "./datasources/homepage-datasource";
export { AboutDataSource } from "./datasources/about-datasource";
export { PersonalLayout } from "./layouts/PersonalLayout";

/**
 * Default export: the personal site routes.
 * Enables brain.yaml package resolution:
 *   plugins.site-builder.routes: "@brains/layout-personal"
 */
export { routes as default } from "./routes";
