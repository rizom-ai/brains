import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { siteContentSchema } from "./schemas/site-content";
import { siteContentAdapter } from "./adapters/site-content-adapter";
import { SiteContentService } from "./lib/site-content-service";
import { createSiteContentTools } from "./tools";
import packageJson from "../package.json";

/**
 * Site content plugin - manages AI-generated content for site sections
 * Discovers routes via messaging from site-builder, generates content,
 * and persists it as site-content entities
 */
export class SiteContentPlugin extends ServicePlugin {
  private siteContentService: SiteContentService | undefined;

  constructor() {
    super("site-content", packageJson, {}, z.object({}));
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Register site content entity type
    context.entities.register(
      "site-content",
      siteContentSchema,
      siteContentAdapter,
    );

    // Initialize the site content service
    this.siteContentService = new SiteContentService(context);
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return createSiteContentTools(() => this.siteContentService, this.id);
  }
}

export function siteContentPlugin(): SiteContentPlugin {
  return new SiteContentPlugin();
}
