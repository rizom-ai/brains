import type { Plugin, PluginContext, PluginCapabilities } from "@brains/types";
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
  landingPageSchema,
  dashboardSchema,
} from "./content-schemas";
import { LandingPageFormatter } from "./formatters/landingPageFormatter";

export interface WebserverPluginOptions {
  // Output directory for generated site
  outputDir?: string;

  // Path to the Astro site template
  astroSiteTemplate?: string;

  // Server configuration
  previewPort?: number;
  productionPort?: number;

  // Site metadata
  siteTitle?: string;
  siteDescription?: string;
  siteUrl?: string;
}

/**
 * Create a webserver plugin instance
 */
export function webserverPlugin(options: WebserverPluginOptions = {}): Plugin {
  return {
    id: "webserver",
    version: "1.0.0",
    name: "Webserver Plugin",
    description:
      "Generates and serves static websites from Personal Brain content",

    async register(context: PluginContext): Promise<PluginCapabilities> {
      const { registry, logger, formatters, registerEntityType, contentTypes } =
        context;

      // Register site-content entity type
      registerEntityType("site-content", siteContentSchema, siteContentAdapter);

      // Register site-content formatter
      formatters.register("site-content", new SiteContentFormatter());

      // Register content type schemas with formatters (plugin ID will be prefixed automatically)
      contentTypes.register("landing:hero", landingHeroDataSchema);
      contentTypes.register(
        "landing:page",
        landingPageSchema,
        new LandingPageFormatter(),
      );
      contentTypes.register("dashboard:main", dashboardSchema);

      // Create webserver manager instance
      const managerOptions: WebserverManagerOptions = {
        logger: logger.child("WebserverPlugin"),
        registry,
        context,
        outputDir: options.outputDir ?? "./dist",
        previewPort: options.previewPort ?? 4321,
        productionPort: options.productionPort ?? 8080,
        siteTitle: options.siteTitle ?? "Personal Brain",
        siteDescription:
          options.siteDescription ?? "A digital knowledge repository",
      };

      // Only add optional properties if they have values
      if (options.astroSiteTemplate !== undefined) {
        managerOptions.astroSiteTemplate = options.astroSiteTemplate;
      }
      if (options.siteUrl !== undefined) {
        managerOptions.siteUrl = options.siteUrl;
      }

      const manager = new WebserverManager(managerOptions);

      // Register the manager for other components to access
      registry.register("webserverManager", () => manager);

      // Return plugin capabilities
      return {
        tools: webserverTools(manager),
        resources: [],
      };
    },
  };
}
