import type {
  Plugin,
  Resource,
  ServicePluginContext,
  Tool,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import {
  HOMEPAGE_ATLAS_SCRIPT,
  HOMEPAGE_ATLAS_SCRIPT_PATH,
  homepageChatAvailable,
  loadHomepageOpening,
} from "@brains/site-atlas";
import { createTemplate } from "@brains/templates";
import { z } from "@brains/utils/zod";
import {
  organizationSiteConfigSchema,
  type OrganizationSiteConfig,
  type OrganizationSiteConfigInput,
} from "./config";
import { OrganizationAboutDataSource } from "./datasources/about-datasource";
import { OrganizationHomepageDataSource } from "./datasources/homepage-datasource";
import { organizationProfileSchema } from "./schemas/organization-profile";
import {
  OrganizationAbout,
  type OrganizationAboutData,
} from "./templates/about";
import {
  organizationHomepageSchema,
  type OrganizationHomepageData,
} from "./schemas/homepage";
import { OrganizationHomepage } from "./templates/homepage";
import packageJson from "../package.json";

/**
 * Organization Site Plugin
 * Provides the radar homepage and its datasource
 */
export class OrganizationSitePlugin extends ServicePlugin<
  OrganizationSiteConfig,
  OrganizationSiteConfigInput
> {
  public readonly dependencies: string[] = ["agent-discovery"];

  constructor(config: OrganizationSiteConfigInput) {
    super(
      "organization-site",
      packageJson,
      config,
      organizationSiteConfigSchema,
    );
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.entities.registerDataSource(
      new OrganizationHomepageDataSource({
        loadOpening: (buildContext): ReturnType<typeof loadHomepageOpening> =>
          loadHomepageOpening(buildContext, context),
        chatAvailable: (buildContext): Promise<boolean> =>
          homepageChatAvailable(buildContext, context),
      }),
    );

    context.entities.registerDataSource(new OrganizationAboutDataSource());

    context.templates.register({
      homepage: createTemplate<OrganizationHomepageData>({
        name: "homepage",
        description:
          "Organization homepage: the opening over the radar of the agent network",
        schema: organizationHomepageSchema,
        dataSourceId: "organization:homepage",
        requiredPermission: "public",
        // Touch title cards, the door's theme and motion pausing for the frame.
        runtimeScripts: [{ src: HOMEPAGE_ATLAS_SCRIPT_PATH, defer: true }],
        staticAssets: { [HOMEPAGE_ATLAS_SCRIPT_PATH]: HOMEPAGE_ATLAS_SCRIPT },
        layout: { component: OrganizationHomepage },
      }),
      about: createTemplate<OrganizationAboutData>({
        name: "about",
        description:
          "About page: the team or organization from its anchor profile",
        schema: z.object({ profile: organizationProfileSchema }),
        dataSourceId: "organization:about",
        requiredPermission: "public",
        layout: { component: OrganizationAbout },
      }),
    });

    this.logger.info("Organization site plugin registered successfully");
  }

  /**
   * No tools needed for this plugin
   */
  protected override async getTools(): Promise<Tool[]> {
    return [];
  }

  /**
   * No resources needed for this plugin
   */
  protected override async getResources(): Promise<Resource[]> {
    return [];
  }
}

/**
 * Factory function to create the plugin
 */
export function organizationSitePlugin(
  config?: OrganizationSiteConfigInput,
): Plugin {
  return new OrganizationSitePlugin(config ?? {});
}
