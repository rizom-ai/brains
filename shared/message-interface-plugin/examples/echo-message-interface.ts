import { MessageInterfacePlugin } from "../src";
import type { MessageContext } from "@brains/types";
import type { JobProgressEvent } from "@brains/job-queue";
import type { JobContext } from "@brains/db";
import { z } from "zod";

// Define the plugin configuration schema
const echoConfigSchema = z.object({
  enabled: z.boolean().describe("Enable the echo interface"),
  prefix: z.string().describe("Prefix for echo messages"),
  debug: z.boolean().describe("Enable debug logging"),
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
export class EchoMessageInterface extends MessageInterfacePlugin<EchoConfig> {
  declare protected config: EchoConfig;
  private messageCounter = 0;

  constructor(config: EchoConfigInput = {}) {
    const defaults: Partial<EchoConfig> = {
      enabled: true,
      prefix: "[ECHO]",
      debug: false,
    };

    super(
      "echo-interface",
      {
        name: "@brains/echo-interface-plugin",
        version: "1.0.0",
        description: "Example echo message interface for testing",
      },
      config,
      echoConfigSchema,
      defaults,
    );
  }

  /**
   * Handle progress events - echo them back
   */
  protected async handleProgressEvent(
    progressEvent: JobProgressEvent,
    context: JobContext,
  ): Promise<void> {
    const { jobId, batchId, progress, message } = progressEvent;
    const progressMessage = `${this.config.prefix} Progress Update: ${message} (${progress}%)`;

    // Look up the original message ID for this job/batch
    const originalMessageId = jobId
      ? this.jobMessages.get(jobId)
      : batchId
        ? this.jobMessages.get(batchId)
        : undefined;

    if (originalMessageId) {
      // Edit the original message with progress
      await this.editMessage(originalMessageId, progressMessage, {
        userId: context.userId,
        channelId: "progress-updates",
        messageId: originalMessageId,
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
): EchoMessageInterface {
  return new EchoMessageInterface(config);
}
