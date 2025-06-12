import type { Plugin, PluginContext, PluginCapabilities } from "@brains/types";
import { validatePluginConfig } from "@brains/utils";
import { webserverTools } from "./tools";
import {
  WebserverManager,
  type WebserverManagerOptions,
} from "./webserver-manager";
import { siteContentSchema } from "./schemas";
import { siteContentAdapter } from "./site-content-adapter";
import { SiteContentFormatter } from "./site-content-formatter";
import {
  landingHeroDataSchema,
  featuresSectionSchema,
  ctaSectionSchema,
  landingPageReferenceSchema,
  dashboardSchema,
} from "./content-schemas";
import { LandingPageFormatter } from "./formatters/landingPageFormatter";
import {
  webserverConfigSchema,
  type WebserverConfig,
  type WebserverConfigInput,
} from "./config";

/**
 * @deprecated Use WebserverConfigInput from './config' instead
 */
export type WebserverPluginOptions = WebserverConfigInput;

// Export configuration types
export { webserverConfigSchema, type WebserverConfig, type WebserverConfigInput } from "./config";

/**
 * Create a webserver plugin instance
 */
export function webserverPlugin(options: WebserverConfigInput = {}): Plugin {
  // Validate configuration
  const config: WebserverConfig = validatePluginConfig(
    webserverConfigSchema,
    options,
    "webserver",
  );
  return {
    id: "webserver",
    version: "1.0.0",
    name: "Webserver Plugin",
    description:
      "Generates and serves static websites from Personal Brain content",

    async register(context: PluginContext): Promise<PluginCapabilities> {
      const { logger, formatters, registerEntityType, contentTypes } = context;

      // Register site-content entity type
      registerEntityType("site-content", siteContentSchema, siteContentAdapter);

      // Register site-content formatter
      formatters.register("site-content", new SiteContentFormatter());

      // Import section formatters
      const { HeroSectionFormatter } = await import(
        "./formatters/heroSectionFormatter"
      );
      const { FeaturesSectionFormatter } = await import(
        "./formatters/featuresSectionFormatter"
      );
      const { CTASectionFormatter } = await import(
        "./formatters/ctaSectionFormatter"
      );

      // Sections are stored as generated-content entities, not custom entity types
      // They are registered as content types for generation purposes

      // Register section content types
      contentTypes.register(
        "section:hero",
        landingHeroDataSchema,
        new HeroSectionFormatter(),
      );
      contentTypes.register(
        "section:features",
        featuresSectionSchema,
        new FeaturesSectionFormatter(),
      );
      contentTypes.register(
        "section:cta",
        ctaSectionSchema,
        new CTASectionFormatter(),
      );

      // Landing page uses the generated-content entity type with custom adapter
      // It's not registered as a separate entity type

      // Register page content types
      contentTypes.register(
        "page:landing",
        landingPageReferenceSchema,
        new LandingPageFormatter(),
      );
      contentTypes.register("page:dashboard", dashboardSchema);

      // Create webserver manager instance
      const managerOptions: WebserverManagerOptions = {
        logger: logger.child("WebserverPlugin"),
        context,
        outputDir: config.outputDir,
        previewPort: config.previewPort,
        productionPort: config.productionPort,
        siteTitle: config.siteTitle,
        siteDescription: config.siteDescription,
      };
      
      // Add optional fields if present
      if (config.astroSiteTemplate !== undefined) {
        managerOptions.astroSiteTemplate = config.astroSiteTemplate;
      }
      if (config.siteUrl !== undefined) {
        managerOptions.siteUrl = config.siteUrl;
      }

      const manager = new WebserverManager(managerOptions);

      // Return plugin capabilities
      return {
        tools: webserverTools(manager),
        resources: [],
      };
    },
  };
}
