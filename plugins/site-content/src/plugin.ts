import type { Tool, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { siteContentSchema } from "./schemas/site-content";
import { siteContentAdapter } from "./adapters/site-content-adapter";
import { SiteContentService } from "./lib/site-content-service";
import { createSiteContentTemplates } from "./lib/site-content-definitions";
import type { SiteContentPluginConfig } from "./definitions";
import { siteContentPluginConfigSchema } from "./schemas/config";
import { createSiteContentTools } from "./tools";
import packageJson from "../package.json";

export class SiteContentPlugin extends ServicePlugin<SiteContentPluginConfig> {
  private siteContentService: SiteContentService | undefined;

  constructor(config: SiteContentPluginConfig = {}) {
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

    const definitions = this.config.definitions
      ? Array.isArray(this.config.definitions)
        ? this.config.definitions
        : [this.config.definitions]
      : [];

    for (const definition of definitions) {
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
  config: SiteContentPluginConfig = {},
): SiteContentPlugin {
  return new SiteContentPlugin(config);
}
