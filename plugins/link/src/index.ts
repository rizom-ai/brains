import type { Plugin, ServicePluginContext, PluginTool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { linkConfigSchema, linkSchema, type LinkConfig } from "./schemas/link";
import { LinkAdapter } from "./adapters/link-adapter";
import { createLinkTools } from "./tools/index";
import {
  linkExtractionTemplate,
  type LinkExtractionResult,
} from "./templates/extraction-template";
import { linkListTemplate } from "./templates/link-list";
import { LinksDataSource } from "./datasources/links-datasource";
import { UrlFetcher } from "./lib/url-fetcher";
import { LinkCaptureJobHandler } from "./handlers/capture-handler";
import packageJson from "../package.json";

// Schema for extractContent eval handler input
const extractContentInputSchema = z.object({
  url: z.string().url(),
});

/**
 * Link plugin for web content capture with AI-powered extraction
 *
 * Captures web links and extracts their content using AI, storing them
 * as structured markdown entities. Links are captured explicitly via the
 * link_capture tool.
 */
export class LinkPlugin extends ServicePlugin<LinkConfig> {
  constructor(config: Partial<LinkConfig> = {}) {
    super("link", packageJson, config, linkConfigSchema);
  }

  /**
   * Register plugin components
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Register the link entity type with its adapter
    const linkAdapter = new LinkAdapter();
    context.registerEntityType("link", linkSchema, linkAdapter);

    // Register templates
    context.registerTemplates({
      extraction: linkExtractionTemplate,
      "link-list": linkListTemplate,
    });

    // Register DataSource
    const linksDataSource = new LinksDataSource(
      context.entityService,
      this.logger.child("LinksDataSource"),
    );
    context.registerDataSource(linksDataSource);

    // Register job handler for async link capture
    const linkCaptureHandler = new LinkCaptureJobHandler(
      this.logger.child("LinkCaptureJobHandler"),
      context,
      this.config.jinaApiKey
        ? { jinaApiKey: this.config.jinaApiKey }
        : undefined,
    );
    context.registerJobHandler("capture", linkCaptureHandler);

    // Register eval handler for testing extraction quality
    context.registerEvalHandler("extractContent", async (input: unknown) => {
      const { url } = extractContentInputSchema.parse(input);

      // Fetch URL content
      const urlFetcher = new UrlFetcher(
        this.config.jinaApiKey
          ? { jinaApiKey: this.config.jinaApiKey }
          : undefined,
      );
      const fetchResult = await urlFetcher.fetch(url);

      if (!fetchResult.success) {
        return {
          success: false,
          error: fetchResult.error,
          errorType: fetchResult.errorType,
        };
      }

      // Extract structured content using AI
      return context.generateContent<LinkExtractionResult>({
        templateName: "link:extraction",
        prompt: `Extract structured information from this webpage content:\n\n${fetchResult.content}`,
        data: { url, hasContent: true },
        interfacePermissionGrant: "public",
      });
    });

    this.logger.debug("Link plugin registered successfully");
  }

  /**
   * Get plugin tools
   */
  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.context) {
      throw new Error("Plugin context not available");
    }
    return createLinkTools(this.id, this.context);
  }
}

/**
 * Create a link plugin instance
 */
export function createLinkPlugin(config: Partial<LinkConfig> = {}): Plugin {
  return new LinkPlugin(config);
}

/**
 * Convenience function matching other plugin patterns
 */
export const linkPlugin = createLinkPlugin;

// Export types and schemas for use by other plugins
export type { LinkConfig, LinkEntity, LinkBody } from "./schemas/link";
export { linkSchema, linkBodySchema, linkConfigSchema } from "./schemas/link";
export { LinkAdapter } from "./adapters/link-adapter";
export { LinkService } from "./lib/link-service";
