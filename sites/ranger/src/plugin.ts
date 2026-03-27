import type { Tool, Resource, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { templates } from "./templates";

const rangerSiteConfigSchema = z.object({});

/**
 * Ranger Site Plugin
 *
 * Registers intro, about, and presentation templates for the ranger site.
 */
export class RangerSitePlugin extends ServicePlugin {
  constructor(config: Record<string, unknown> = {}) {
    super(
      "ranger-site",
      { name: "@brains/site-ranger", version: "0.1.0" },
      config,
      rangerSiteConfigSchema,
    );
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.templates.register(templates);
    this.logger.info("Ranger site plugin registered successfully");
  }

  protected override async getTools(): Promise<Tool[]> {
    return [];
  }

  protected override async getResources(): Promise<Resource[]> {
    return [];
  }
}
