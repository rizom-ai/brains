import type { Tool, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { ensureArray } from "@brains/utils/array";
import { siteContentSchema } from "./schemas/site-content";
import { siteContentAdapter } from "./adapters/site-content-adapter";
import { SiteContentService } from "./lib/site-content-service";
import { createSiteContentTemplates } from "./lib/site-content-definitions";
import {
  siteContentPluginConfigSchema,
  type SiteContentPluginConfig,
  type SiteContentPluginConfigInput,
} from "./schemas/config";
import { createSiteContentTools } from "./tools";
import packageJson from "../package.json";

export class SiteContentPlugin extends ServicePlugin<
  SiteContentPluginConfig,
  SiteContentPluginConfigInput
> {
  private siteContentService: SiteContentService | undefined;

  constructor(config: SiteContentPluginConfigInput = {}) {
    super("site-content", packageJson, config, siteContentPluginConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.entities.register(
      "site-content",
      siteContentSchema,
      siteContentAdapter,
    );

    for (const definition of ensureArray(this.config.definitions)) {
      context.templates.register(
        createSiteContentTemplates(definition),
        definition.namespace,
      );
    }

    this.siteContentService = new SiteContentService(context);
  }

  protected override async getTools(): Promise<Tool[]> {
    return createSiteContentTools(() => this.siteContentService, this.id);
  }
}

export function siteContentPlugin(
  config: SiteContentPluginConfigInput = {},
): SiteContentPlugin {
  return new SiteContentPlugin(config);
}
