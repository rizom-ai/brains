import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { createTemplate } from "@brains/templates";
import { enrichedBlogPostSchema } from "@brains/blog";
import { enrichedDeckSchema } from "@brains/decks";
import { professionalProfileSchema } from "./schemas";
import { HomepageListDataSource } from "./datasources/homepage-datasource";
import { AboutDataSource } from "./datasources/about-datasource";
import {
  HomepageListLayout,
  type HomepageListData,
} from "./templates/homepage-list";
import { AboutPageLayout, type AboutPageData } from "./templates/about";
import {
  type ProfessionalSiteConfig,
  professionalSiteConfigSchema,
} from "./config";
import packageJson from "../package.json";

/**
 * Professional Site Plugin
 * Provides homepage template and datasource for professional brain
 */
export class ProfessionalSitePlugin extends ServicePlugin<ProfessionalSiteConfig> {
  public readonly dependencies = ["blog", "decks"];

  constructor(config: ProfessionalSiteConfig) {
    super(
      "professional-site",
      packageJson,
      config,
      professionalSiteConfigSchema,
    );
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Compute entity list URLs from config
    const postsConfig = this.config.entityRouteConfig.post;
    const decksConfig = this.config.entityRouteConfig.deck;

    const postsListUrl = `/${postsConfig.pluralName ?? postsConfig.label.toLowerCase() + "s"}`;
    const decksListUrl = `/${decksConfig.pluralName ?? decksConfig.label.toLowerCase() + "s"}`;

    // Register homepage datasource
    const homepageDataSource = new HomepageListDataSource(
      context.entityService,
      postsListUrl,
      decksListUrl,
    );
    context.registerDataSource(homepageDataSource);

    // Register about page datasource
    const aboutDataSource = new AboutDataSource(context.entityService);
    context.registerDataSource(aboutDataSource);

    // Register homepage template
    // Schema validates with optional url/typeLabel, site-builder enriches before rendering
    const homepageListSchema = z.object({
      profile: professionalProfileSchema,
      posts: z.array(enrichedBlogPostSchema),
      decks: z.array(enrichedDeckSchema),
      postsListUrl: z.string(),
      decksListUrl: z.string(),
    });

    // About page schema
    const aboutPageSchema = z.object({
      profile: professionalProfileSchema,
    });

    context.registerTemplates({
      "homepage-list": createTemplate<
        z.infer<typeof homepageListSchema>,
        HomepageListData
      >({
        name: "homepage-list",
        description: "Professional homepage with essays and presentations",
        schema: homepageListSchema,
        dataSourceId: "professional:homepage-list",
        requiredPermission: "public",
        layout: {
          component: HomepageListLayout,
          interactive: false,
        },
      }),
      about: createTemplate<z.infer<typeof aboutPageSchema>, AboutPageData>({
        name: "about",
        description: "About page with full profile information",
        schema: aboutPageSchema,
        dataSourceId: "professional:about",
        requiredPermission: "public",
        layout: {
          component: AboutPageLayout,
          interactive: false,
        },
      }),
    });

    this.logger.info("Professional site plugin registered successfully");
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

/**
 * Factory function to create the plugin
 */
export function professionalSitePlugin(config: ProfessionalSiteConfig): Plugin {
  return new ProfessionalSitePlugin(config);
}
