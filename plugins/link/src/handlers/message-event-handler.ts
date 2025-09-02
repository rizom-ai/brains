import type { ServicePluginContext, MessageHandler } from "@brains/plugins";
import type { LinkConfig } from "../schemas/link";
import type { Logger } from "@brains/utils";
import { UrlUtils } from "../lib/url-utils";

/**
 * Message event data structure (from conversation service)
 */
export interface ConversationMessageEvent {
  conversationId: string;
  messageId: string;
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Handles conversation message events for auto-capture
 * Extracts URLs from messages and enqueues capture jobs
 */
export class MessageEventHandler {
  private static instance: MessageEventHandler | null = null;
  private logger: Logger;
  private context: ServicePluginContext;
  private config: LinkConfig;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    context: ServicePluginContext,
    config: LinkConfig,
  ): MessageEventHandler {
    MessageEventHandler.instance ??= new MessageEventHandler(context, config);
    return MessageEventHandler.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    MessageEventHandler.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    context: ServicePluginContext,
    config: LinkConfig,
  ): MessageEventHandler {
    return new MessageEventHandler(context, config);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(context: ServicePluginContext, config: LinkConfig) {
    this.context = context;
    this.config = config;
    this.logger = context.logger.child("MessageEventHandler");
  }

  /**
   * Get the message handler function for subscription
   */
  public getHandler(): MessageHandler<ConversationMessageEvent, void> {
    return async (message) => {
      // Extract the payload from the message
      const event = message.payload;
      await this.handleMessage(event);
      return { success: true };
    };
  }

  /**
   * Handle a conversation message event
   */
  private async handleMessage(event: ConversationMessageEvent): Promise<void> {
    try {
      // Skip if auto-capture is disabled
      if (!this.config.enableAutoCapture) {
        return;
      }

      // Skip assistant messages (as per planning document)
      if (event.role === "assistant") {
        return;
      }

      // Extract URLs from the message
      const urls = UrlUtils.extractUrls(event.content);

      if (urls.length === 0) {
        return;
      }

      // Limit the number of URLs to capture per message
      const urlsToCapture = urls.slice(0, this.config.maxUrlsPerMessage);

      this.logger.debug("Found URLs in message", {
        messageId: event.messageId,
        urlCount: urls.length,
        capturingCount: urlsToCapture.length,
      });

      // Enqueue capture jobs for each URL
      for (const url of urlsToCapture) {
        try {
          // Validate URL before enqueueing
          if (!UrlUtils.isValidUrl(url)) {
            this.logger.debug("Skipping invalid URL", { url });
            continue;
          }

          const jobId = await this.context.enqueueJob(
            "auto-capture",
            {
              url,
              metadata: {
                conversationId: event.conversationId,
                messageId: event.messageId,
                userId: event.metadata?.["userId"] as string | undefined,
                timestamp: new Date(event.timestamp).toISOString(),
              },
            },
            {
              priority: 5, // Lower priority for auto-capture
              maxRetries: 2, // Fewer retries for auto-capture
              source: `plugin:${this.context.pluginId}`,
              metadata: {
                rootJobId: `link-auto-capture-${Date.now()}`,
                operationType: "data_processing" as const,
                pluginId: this.context.pluginId,
              },
            },
          );

          this.logger.info("Enqueued auto-capture job", {
            jobId,
            url,
            conversationId: event.conversationId,
          });
        } catch (error) {
          this.logger.error("Failed to enqueue auto-capture job", {
            url,
            error,
          });
        }
      }
    } catch (error) {
      this.logger.error("Error handling message event", {
        messageId: event.messageId,
        error,
      });
    }
  }
}
