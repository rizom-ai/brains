import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { siteContentSchema } from "./schemas/site-content";
import { siteContentAdapter } from "./adapters/site-content-adapter";
import { SiteContentService } from "./lib/site-content-service";
import { createSiteContentTools } from "./tools";
import packageJson from "../package.json";

export class SiteContentPlugin extends ServicePlugin {
  private siteContentService: SiteContentService | undefined;

  constructor() {
    super("site-content", packageJson, {}, z.object({}));
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.entities.register(
      "site-content",
      siteContentSchema,
      siteContentAdapter,
    );

    this.siteContentService = new SiteContentService(context);
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return createSiteContentTools(() => this.siteContentService, this.id);
  }
}

export function siteContentPlugin(): SiteContentPlugin {
  return new SiteContentPlugin();
}
