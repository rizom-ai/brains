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
} from "@brains/site-atlas";
import { createTemplate } from "@brains/templates";
import {
  organizationSiteConfigSchema,
  type OrganizationSiteConfig,
  type OrganizationSiteConfigInput,
} from "./config";
import { OrganizationHomepageDataSource } from "./datasources/homepage-datasource";
import {
  organizationHomepageSchema,
  type OrganizationHomepageData,
} from "./schemas/homepage";
import { OrganizationHomepage } from "./templates/homepage";
import packageJson from "../package.json";

/**
 * Organization Site Plugin
 * Provides the atlas homepage, drawn from the agent network, and its datasource
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
    context.entities.registerDataSource(new OrganizationHomepageDataSource());

    context.templates.register({
      homepage: createTemplate<OrganizationHomepageData>({
        name: "homepage",
        description:
          "Organization homepage: the opening over the atlas of the agent network",
        schema: organizationHomepageSchema,
        dataSourceId: "organization:homepage",
        requiredPermission: "public",
        // Touch titles and motion pausing for the atlas.
        runtimeScripts: [{ src: HOMEPAGE_ATLAS_SCRIPT_PATH, defer: true }],
        staticAssets: { [HOMEPAGE_ATLAS_SCRIPT_PATH]: HOMEPAGE_ATLAS_SCRIPT },
        layout: { component: OrganizationHomepage },
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
