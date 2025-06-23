import { ContentGeneratingPlugin } from "@brains/utils";
import type {
  PluginContext,
  PluginTool,
  PluginResource,
  ViewTemplate,
  ComponentType,
  ContentTemplate,
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
import { ROUTES } from "./pages";

// Import schemas for layouts
import { landingHeroDataSchema } from "./content/landing/hero/schema";
import { featuresSectionSchema } from "./content/landing/features/schema";
import { productsSectionSchema } from "./content/landing/products/schema";
import { ctaSectionSchema } from "./content/landing/cta/schema";

// Import site-content entity
import { siteContentSchema } from "@brains/types";
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
          template: template as ContentTemplate<unknown>,
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

    // Note: Templates are already registered by ContentGeneratingPlugin base class
    // No need to register them again with ContentGenerationService

    // Register view templates
    await this.registerViewTemplates(context);

    // Register default routes
    await this.registerRoutes(context);
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

  private async registerViewTemplates(context: PluginContext): Promise<void> {
    // TODO: This is an anti-pattern. Instead of registering directly,
    // we should export static ROUTES and TEMPLATES arrays that the
    // site-builder receives via constructor configuration.
    // See architecture-improvements-plan.md for details.

    // Define view template configurations with multi-format approach
    const viewTemplates: ViewTemplate<unknown>[] = [
      {
        name: "hero",
        schema: landingHeroDataSchema,
        description: "Hero section with headline and call-to-action",
        renderers: {
          web: HeroLayout as ComponentType,
        },
      },
      {
        name: "features",
        schema: featuresSectionSchema,
        description: "Feature grid with icons",
        renderers: {
          web: FeaturesLayout as ComponentType,
        },
      },
      {
        name: "products",
        schema: productsSectionSchema,
        description: "Product card grid",
        renderers: {
          web: ProductsLayout as ComponentType,
        },
      },
      {
        name: "cta",
        schema: ctaSectionSchema,
        description: "Call-to-action section",
        renderers: {
          web: CTALayout as ComponentType,
        },
      },
    ];

    // Register each view template
    for (const template of viewTemplates) {
      context.viewRegistry.registerViewTemplate(template);
      this.logger?.debug(`Registered view template: ${template.name}`);
    }
  }

  private async registerRoutes(context: PluginContext): Promise<void> {
    // TODO: This is an anti-pattern. Routes should be exported as static
    // configuration and passed to site-builder at construction time.
    // See architecture-improvements-plan.md for details.

    // Register all routes from the ROUTES array
    for (const route of ROUTES) {
      context.viewRegistry.registerRoute(route);
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
