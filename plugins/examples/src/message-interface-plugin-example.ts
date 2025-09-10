import { MessageInterfacePlugin } from "@brains/plugins";
import type { 
  MessageContext,
  JobProgressEvent,
  JobContext
} from "@brains/plugins";
import { z } from "@brains/utils";

// Define the plugin configuration schema
const echoConfigSchema = z.object({
  enabled: z.boolean().describe("Enable the echo interface").default(true),
  prefix: z.string().describe("Prefix for echo messages").default("[ECHO]"),
  debug: z.boolean().describe("Enable debug logging").default(false),
});

type EchoConfig = z.infer<typeof echoConfigSchema>;
type EchoConfigInput = Partial<EchoConfig>;

/**
 * Example Echo Message Interface Plugin
 * Demonstrates MessageInterfacePlugin capabilities:
 * - Everything from Interface (daemons, commands, entity access)
 * - Message sending and editing
 * - Progress event handling
 * - Job/batch operation tracking
 */
export class ExampleMessageInterfacePlugin extends MessageInterfacePlugin<EchoConfig> {
  declare protected config: EchoConfig;
  private messageCounter = 0;

  constructor(config: EchoConfigInput = {}) {
    super(
      "echo-interface",
      {
        name: "@brains/echo-interface-plugin",
        version: "1.0.0",
        description: "Example echo message interface for testing",
      },
      config,
      echoConfigSchema,
    );
  }

  /**
   * Handle progress events - echo them back
   */
  protected async handleProgressEvent(
    progressEvent: JobProgressEvent,
    context: JobContext,
  ): Promise<void> {
    const { id, progress, message } = progressEvent;
    const progressPercentage = progress?.percentage ?? 0;
    const progressMessage = `${this.config.prefix} Progress Update: ${message} (${progressPercentage}%)`;

    // Look up the original message ID for this job/batch
    const trackingInfo = this.getJobTracking(id);

    if (trackingInfo) {
      // Edit the original message with progress
      await this.editMessage(trackingInfo.messageId, progressMessage, {
        userId: "system",
        channelId: "progress-updates",
        messageId: trackingInfo.messageId,
        timestamp: new Date(),
        interfaceType: "echo",
        userPermissionLevel: "public",
      });
    }

    if (this.config.debug) {
      this.logger.debug("Progress event handled", { progressEvent, context });
    }
  }

  /**
   * Send a message - just increment counter and return ID
   */
  protected async sendMessage(
    content: string,
    context: MessageContext,
    replyToId?: string,
  ): Promise<string> {
    this.messageCounter++;
    const messageId = `echo-msg-${this.messageCounter}`;

    if (this.config.debug) {
      this.logger.debug("Sending message", {
        messageId,
        content,
        context,
        replyToId,
      });
    }

    // In a real implementation, this would send to an actual message system
    console.log(`${this.config.prefix} ${content}`);

    return messageId;
  }

  /**
   * Edit an existing message
   */
  protected async editMessage(
    messageId: string,
    content: string,
    context: MessageContext,
  ): Promise<void> {
    if (this.config.debug) {
      this.logger.debug("Editing message", {
        messageId,
        content,
        context,
      });
    }

    // In a real implementation, this would edit in the actual message system
    console.log(`${this.config.prefix} [EDIT ${messageId}] ${content}`);
  }

  /**
   * Echo interface always responds to everything
   */
  protected override shouldRespond(
    _message: string,
    _context: MessageContext,
  ): boolean {
    return true; // Always respond for testing
  }

  /**
   * Show thinking indicators - just log for testing
   */
  protected override async showThinkingIndicators(
    context: MessageContext,
  ): Promise<void> {
    if (this.config.debug) {
      this.logger.debug("Showing thinking indicators", { context });
    }
  }

  /**
   * Show done indicators - just log for testing
   */
  protected override async showDoneIndicators(
    context: MessageContext,
  ): Promise<void> {
    if (this.config.debug) {
      this.logger.debug("Showing done indicators", { context });
    }
  }

  /**
   * Start the interface
   */
  public async start(): Promise<void> {
    this.logger.info("Echo interface started");
  }

  /**
   * Stop the interface
   */
  public async stop(): Promise<void> {
    this.logger.info("Echo interface stopped");
  }
}

/**
 * Factory function to create the plugin
 */
export function echoMessageInterfacePlugin(
  config?: EchoConfigInput,
): ExampleMessageInterfacePlugin {
  return new ExampleMessageInterfacePlugin(config);
}
