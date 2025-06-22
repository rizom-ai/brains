import { ContentGeneratingPlugin } from "@brains/utils";
import type {
  PluginContext,
  PluginTool,
  PluginResource,
  LayoutDefinition,
  ComponentType,
} from "@brains/types";

// Import content templates and layouts
import { generalContextTemplate } from "./content/general";
import { heroSectionTemplate, HeroLayout } from "./content/landing/hero";
import {
  featuresSectionTemplate,
  FeaturesLayout,
} from "./content/landing/features";
import {
  productsSectionTemplate,
  ProductsLayout,
} from "./content/landing/products";
import { ctaSectionTemplate, CTALayout } from "./content/landing/cta";

import { landingMetadataTemplate } from "./content/landing/metadata";
import { PAGES } from "./pages";

// Import schemas for layouts
import { landingHeroDataSchema } from "./content/landing/hero/schema";
import { featuresSectionSchema } from "./content/landing/features/schema";
import { productsSectionSchema } from "./content/landing/products/schema";
import { ctaSectionSchema } from "./content/landing/cta/schema";

// Import site-content entity
import { siteContentSchema } from "./entities/site-content-schema";
import { siteContentAdapter } from "./entities/site-content-adapter";

// Define content template configuration
const CONTENT_TEMPLATES = [
  { key: "general-context", template: generalContextTemplate },
  { key: "landing-hero", template: heroSectionTemplate },
  { key: "landing-features", template: featuresSectionTemplate },
  { key: "landing-products", template: productsSectionTemplate },
  { key: "landing-cta", template: ctaSectionTemplate },
  { key: "landing-metadata", template: landingMetadataTemplate },
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

    // Register site-content entity type
    await this.registerEntityTypes(context);

    // Register layouts if available
    if (context.layouts) {
      await this.registerLayouts(context);
    }

    // Register default pages
    await this.registerPages(context);
  }

  private async registerEntityTypes(context: PluginContext): Promise<void> {
    // Register site-content entity type
    context.registerEntityType(
      "site-content",
      siteContentSchema,
      siteContentAdapter,
    );
    this.logger?.debug("Registered site-content entity type");
  }

  private async registerLayouts(context: PluginContext): Promise<void> {
    if (!context.layouts) {
      return;
    }

    // Define layout configurations
    const layouts: LayoutDefinition<unknown>[] = [
      {
        name: "hero",
        component: HeroLayout as ComponentType,
        schema: landingHeroDataSchema,
        description: "Hero section with headline and call-to-action",
      },
      {
        name: "features",
        component: FeaturesLayout as ComponentType,
        schema: featuresSectionSchema,
        description: "Feature grid with icons",
      },
      {
        name: "products",
        component: ProductsLayout as ComponentType,
        schema: productsSectionSchema,
        description: "Product card grid",
      },
      {
        name: "cta",
        component: CTALayout as ComponentType,
        schema: ctaSectionSchema,
        description: "Call-to-action section",
      },
    ];

    // Register each layout
    for (const layout of layouts) {
      context.layouts.register(layout);
      this.logger?.debug(`Registered layout: ${layout.name}`);
    }
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
