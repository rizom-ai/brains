import type {
  Plugin,
  ServicePluginContext,
  PluginTool,
  Command,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { linkConfigSchema, linkSchema, type LinkConfig } from "./schemas/link";
import { LinkAdapter } from "./adapters/link-adapter";
import { createLinkTools } from "./tools/index";
import { createLinkCommands } from "./commands/index";
import { linkExtractionTemplate } from "./templates/extraction-template";
import { linkListTemplate } from "./templates/link-list";
import { LinksDataSource } from "./datasources/links-datasource";
import { AutoCaptureHandler } from "./handlers/auto-capture-handler";
import { MessageEventHandler } from "./handlers/message-event-handler";
import packageJson from "../package.json";

/**
 * Link plugin for web content capture with AI-powered extraction
 *
 * Captures web links and extracts their content using AI, storing them
 * as structured markdown entities following the topics plugin pattern.
 */
export class LinkPlugin extends ServicePlugin<LinkConfig> {
  private messageEventUnsubscribe?: () => void;

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

    // Register auto-capture job handler

    if (this.config.enableAutoCapture) {
      const autoCaptureHandler = AutoCaptureHandler.getInstance(context);
      context.registerJobHandler("auto-capture", autoCaptureHandler);

      // Subscribe to conversation message events
      const messageEventHandler = MessageEventHandler.getInstance(
        context,
        this.config,
      );
      this.messageEventUnsubscribe = context.subscribe(
        "conversation:messageAdded",
        messageEventHandler.getHandler(),
      );
      this.logger.debug("Subscribed to conversation:messageAdded events");
    } else {
      this.logger.debug(
        "Auto-capture is disabled, skipping handler registration",
      );
    }

    this.logger.debug("Link plugin registered successfully");
  }

  /**
   * Clean up when plugin is unregistered
   */
  public async cleanup(): Promise<void> {
    // Unsubscribe from message events if subscribed
    if (this.messageEventUnsubscribe) {
      this.messageEventUnsubscribe();
    }

    // Reset singleton instances for clean testing
    AutoCaptureHandler.resetInstance();
    MessageEventHandler.resetInstance();
  }

  /**
   * Get plugin commands
   */
  protected override async getCommands(): Promise<Command[]> {
    if (!this.context) {
      throw new Error("Plugin context not available");
    }
    return createLinkCommands(this.id, this.context);
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

// Export types and schemas for use by other plugins
export type { LinkConfig, LinkEntity, LinkBody } from "./schemas/link";
export { linkSchema, linkBodySchema, linkConfigSchema } from "./schemas/link";
export { LinkAdapter } from "./adapters/link-adapter";
export { LinkService } from "./lib/link-service";
