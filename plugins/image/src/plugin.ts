import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { imageSchema } from "./schemas/image";
import { imageAdapter } from "./adapters/image-adapter";
import { createUploadTool, createGetTool, createListTool } from "./tools";
import type { ImageConfig, ImageConfigInput } from "./config";
import { imageConfigSchema } from "./config";
import packageJson from "../package.json";

/**
 * Image Plugin
 * Provides image entity support with base64 storage
 */
export class ImagePlugin extends ServicePlugin<ImageConfig> {
  private pluginContext?: ServicePluginContext;

  constructor(config: ImageConfigInput) {
    super("image", packageJson, config, imageConfigSchema);
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;

    // Register image entity type
    context.registerEntityType("image", imageSchema, imageAdapter);

    this.logger.info("Image plugin registered successfully");
  }

  /**
   * Get the tools provided by this plugin
   */
  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.pluginContext) {
      throw new Error("Plugin context not initialized");
    }

    return [
      createUploadTool(this.pluginContext, this.id),
      createGetTool(this.pluginContext, this.id),
      createListTool(this.pluginContext, this.id),
    ];
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
export function imagePlugin(config: ImageConfigInput = {}): Plugin {
  return new ImagePlugin(config);
}
