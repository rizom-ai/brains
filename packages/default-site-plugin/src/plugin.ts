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
import { PAGES } from "./pages";

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

  private async registerPages(context: PluginContext): Promise<void> {
    // Check if site builder is available
    if (!context.pages) {
      this.logger?.warn(
        "Site builder not available, skipping page registration",
      );
      return;
    }

    // Register all pages from the PAGES array
    for (const page of PAGES) {
      context.pages.register(page);
    }
  }

  /**
   * Get tools provided by this plugin
   */
  protected override async getTools(): Promise<PluginTool[]> {
    // TODO: Extract a base SitePlugin class that provides common site management tools:
    // - promote_content - promote content from preview to production
    // - rollback_content - rollback content from production
    // These tools should manage the site-content entity environments
    // and trigger site rebuilds as needed
    // Different site plugins (blog-site, docs-site, etc.) could then extend this base class
    return [];
  }

  /**
   * No resources needed for this plugin
   */
  protected override async getResources(): Promise<PluginResource[]> {
    return [];
  }
}
