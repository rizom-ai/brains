import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { templates } from "./templates";
import packageJson from "../package.json";

const defaultSiteConfigSchema = z.object({});

/**
 * Default Site Plugin
 *
 * Registers the default intro, about, and presentation templates.
 * Used by sites/default as the baseline site plugin.
 */
export class DefaultSitePlugin extends ServicePlugin {
  constructor(config: Record<string, unknown> = {}) {
    super("default-site-content", packageJson, config, defaultSiteConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.templates.register(templates);
    this.logger.info("Default site plugin registered successfully");
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return [];
  }

  protected override async getResources(): Promise<PluginResource[]> {
    return [];
  }
}

export function defaultSitePlugin(
  config: Record<string, unknown> = {},
): Plugin {
  return new DefaultSitePlugin(config);
}
