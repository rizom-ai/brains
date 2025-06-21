import { ContentGeneratingPlugin } from "@brains/utils";
import type { PluginContext, PluginTool, PluginResource } from "@brains/types";

// Import content templates
import { generalContextTemplate } from "./content/general";
import { heroSectionTemplate } from "./content/landing/hero";
import { featuresSectionTemplate } from "./content/landing/features";
import { productsSectionTemplate } from "./content/landing/products";
import { ctaSectionTemplate } from "./content/landing/cta";
import { landingMetadataTemplate } from "./content/landing/metadata";
import { dashboardTemplate } from "./content/dashboard";

// Define content template configuration
const CONTENT_TEMPLATES = [
  { key: "general-context", template: generalContextTemplate },
  { key: "landing-hero", template: heroSectionTemplate },
  { key: "landing-features", template: featuresSectionTemplate },
  { key: "landing-products", template: productsSectionTemplate },
  { key: "landing-cta", template: ctaSectionTemplate },
  { key: "landing-metadata", template: landingMetadataTemplate },
  { key: "dashboard", template: dashboardTemplate },
] as const;

/**
 * Default Site Plugin
 * Provides the default website structure and content templates
 */
export class DefaultSitePlugin extends ContentGeneratingPlugin {
  constructor() {
    super(
      "default-site",
      "Default Site Plugin",
      "Provides default website structure and content templates",
      {}, // No configuration needed for this plugin
    );

    // Register all content types from the array
    for (const { key, template } of CONTENT_TEMPLATES) {
      if (template.formatter) {
        this.registerContentType(key, {
          schema: template.schema,
          contentType: key,
          formatter: template.formatter,
        });
      }
    }
  }

  /**
   * Register content templates and pages
   */
  protected override async onRegister(context: PluginContext): Promise<void> {
    await super.onRegister(context);

    // Register default pages
    await this.registerPages(context);
  }

  private async registerPages(_context: PluginContext): Promise<void> {
    // TODO: Register pages once plugin context has pages support
    // Will register:
    // - Landing page (/) with hero, features, products, and cta sections
    // - Dashboard page (/dashboard)
  }

  /**
   * No tools needed for this plugin
   */
  protected override async getTools(): Promise<PluginTool[]> {
    return [];
  }

  /**
   * No resources needed for this plugin
   */
  protected override async getResources(): Promise<PluginResource[]> {
    return [];
  }
}
