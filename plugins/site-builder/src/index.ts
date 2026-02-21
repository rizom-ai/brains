// Site builder plugin - provides static site generation capabilities
export { SiteBuilderPlugin, siteBuilderPlugin } from "./plugin";
export { builtInTemplates } from "./view-template-schemas";
export { SiteBuilder } from "./lib/site-builder";
export type {
  StaticSiteBuilder,
  StaticSiteBuilderOptions,
  StaticSiteBuilderFactory,
  BuildContext,
} from "./lib/static-site-builder";
export { createPreactBuilder } from "./lib/preact-builder";

// Re-export Head component and utilities from ui-library for convenience
export { Head, useHead, HeadProvider } from "@brains/ui-library";
export type { HeadProps } from "@brains/ui-library";

// Export site content types and schemas
export type { SiteContent } from "./types";
export { siteContentSchema } from "./types";

// Export site info types and adapter
export type { SiteInfo } from "./types/site-info";
export { SiteInfoSchema } from "./types/site-info";
export { SiteInfoAdapter } from "./services/site-info-adapter";
export type { SiteInfoBody, SiteInfoCTA } from "./services/site-info-schema";
export { siteInfoCTASchema } from "./services/site-info-schema";

// Export event payload types for plugins that subscribe to build events
export type { SiteBuildCompletedPayload } from "./types/job-types";

// Export UI slot registry for plugin-registered components
export { UISlotRegistry } from "./lib/ui-slot-registry";
export type { SlotRegistration } from "./lib/ui-slot-registry";
export type { LayoutSlots } from "./config";
export { Slot } from "./components/Slot";
export type { SlotProps } from "./components/Slot";
