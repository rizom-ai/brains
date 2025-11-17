import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { createTemplate } from "@brains/templates";
import { blogPostSchema } from "@brains/blog";
import { deckSchema } from "@brains/decks";
import { profileBodySchema } from "@brains/profile-service";
import { HomepageListDataSource } from "./datasources/homepage-datasource";
import {
  HomepageListLayout,
  type HomepageListData,
} from "./templates/homepage-list";
import packageJson from "../package.json";

/**
 * Professional Site Plugin
 * Provides homepage template and datasource for professional brain
 */
export class ProfessionalSitePlugin extends ServicePlugin<
  Record<string, never>
> {
  public readonly dependencies = ["blog", "decks"];

  constructor() {
    super("professional-site", packageJson, {}, z.object({}));
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Register homepage datasource
    const homepageDataSource = new HomepageListDataSource(
      context.entityService,
    );
    context.registerDataSource(homepageDataSource);

    // Register homepage template
    const homepageListSchema = z.object({
      profile: profileBodySchema,
      posts: z.array(blogPostSchema),
      decks: z.array(deckSchema),
    });

    context.registerTemplates({
      "homepage-list": createTemplate<HomepageListData>({
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
export function professionalSitePlugin(): Plugin {
  return new ProfessionalSitePlugin();
}
