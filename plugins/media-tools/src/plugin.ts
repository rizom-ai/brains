import type { ServicePluginContext, Tool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { createMediaTools } from "./tools";
import packageJson from "../package.json";

const mediaToolsConfigSchema = z.object({});

type MediaToolsConfig = z.infer<typeof mediaToolsConfigSchema>;

export class MediaToolsPlugin extends ServicePlugin<MediaToolsConfig> {
  private pluginContext: ServicePluginContext | undefined;

  constructor(config: Partial<MediaToolsConfig> = {}) {
    super("media-tools", packageJson, config, mediaToolsConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;
  }

  protected override async getTools(): Promise<Tool[]> {
    if (!this.pluginContext) {
      throw new Error("Plugin context not initialized");
    }
    return createMediaTools(this.id, this.pluginContext);
  }
}

export function mediaToolsPlugin(
  config: Partial<MediaToolsConfig> = {},
): MediaToolsPlugin {
  return new MediaToolsPlugin(config);
}
