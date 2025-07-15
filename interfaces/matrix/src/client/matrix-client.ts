import {
  MatrixClient,
  SimpleFsStorageProvider,
  AutojoinRoomsMixin,
  LogLevel,
  LogService,
  RichConsoleLogger,
} from "matrix-bot-sdk";
import type { Logger } from "@brains/utils";
import type { MatrixConfig } from "../types";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

/**
 * Wrapper around matrix-bot-sdk MatrixClient with additional functionality
 */
export class MatrixClientWrapper {
  private client: MatrixClient;
  private readonly config: MatrixConfig;
  private readonly logger: Logger;
  private connected = false;

  constructor(config: MatrixConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;

    // Set up matrix-bot-sdk logging
    LogService.setLogger(new RichConsoleLogger());
    LogService.setLevel(LogLevel.INFO);

    // Create storage provider
    const storageDir = config.storageDir ?? ".matrix-storage";
    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true });
    }

    const storage = new SimpleFsStorageProvider(
      join(storageDir, "bot-storage.json"),
    );

    // Create client
    this.client = new MatrixClient(
      config.homeserver,
      config.accessToken,
      storage,
    );

    // Device ID will be handled during crypto setup in future phases

    // Apply auto-join mixin if enabled
    if (config.autoJoinRooms) {
      AutojoinRoomsMixin.setupOnClient(this.client);
    }

    this.logger.info("Matrix client initialized", {
      homeserver: config.homeserver,
      userId: config.userId,
    });
  }

  /**
   * Start the client and sync
   */
  async start(): Promise<void> {
    if (this.connected) {
      this.logger.warn("Matrix client already started");
      return;
    }

    try {
      this.logger.info("Starting Matrix client...");

      // Verify we can connect
      const whoami = await this.client.getUserId();
      if (whoami !== this.config.userId) {
        throw new Error(
          `User ID mismatch: expected ${this.config.userId}, got ${whoami}`,
        );
      }

      // Set display name if provided
      if (this.config.deviceDisplayName) {
        try {
          await this.client.setDisplayName(this.config.deviceDisplayName);
        } catch (error) {
          this.logger.warn("Failed to set display name", { error });
        }
      }

      // Start syncing
      await this.client.start();
      this.connected = true;
      this.logger.info("Matrix client started successfully");
    } catch (error) {
      this.logger.error("Failed to start Matrix client", { error });
      throw error;
    }
  }

  /**
   * Stop the client
   */
  async stop(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      this.logger.info("Stopping Matrix client...");
      this.client.stop();
      this.connected = false;
      this.logger.info("Matrix client stopped");
    } catch (error) {
      this.logger.error("Error stopping Matrix client", { error });
      throw error;
    }
  }

  /**
   * Send a text message to a room
   */
  async sendTextMessage(
    roomId: string,
    text: string,
    isNotice = false,
  ): Promise<string> {
    const content = {
      msgtype: isNotice ? "m.notice" : "m.text",
      body: text,
    };

    return this.client.sendMessage(roomId, content);
  }

  /**
   * Send a formatted message with markdown
   */
  async sendFormattedMessage(
    roomId: string,
    text: string,
    html: string,
    isNotice = false,
  ): Promise<string> {
    const content = {
      msgtype: isNotice ? "m.notice" : "m.text",
      body: text,
      format: "org.matrix.custom.html",
      formatted_body: html,
    };

    return this.client.sendMessage(roomId, content);
  }

  /**
   * Set typing notification state
   */
  async setTyping(
    roomId: string,
    isTyping: boolean,
    timeout?: number,
  ): Promise<void> {
    await this.client.setTyping(
      roomId,
      isTyping,
      timeout ?? this.config.typingTimeout,
    );
  }

  /**
   * React to a message
   */
  async sendReaction(
    roomId: string,
    eventId: string,
    reaction: string,
  ): Promise<string> {
    const content = {
      "m.relates_to": {
        rel_type: "m.annotation",
        event_id: eventId,
        key: reaction,
      },
    };

    return this.client.sendEvent(roomId, "m.reaction", content);
  }

  /**
   * Send a reply to a message
   */
  async sendReply(
    roomId: string,
    replyToEventId: string,
    text: string,
    html?: string,
  ): Promise<string> {
    const content: Record<string, unknown> = {
      msgtype: "m.text",
      body: text,
      "m.relates_to": {
        "m.in_reply_to": {
          event_id: replyToEventId,
        },
      },
    };

    if (html) {
      content["format"] = "org.matrix.custom.html";
      content["formatted_body"] = html;
    }

    return this.client.sendMessage(roomId, content);
  }

  /**
   * Get recent messages from a room
   */
  async getRecentMessages(_roomId: string, _limit: number): Promise<unknown[]> {
    // Message history will be implemented in a future phase
    // For now, return empty array
    return [];
  }

  /**
   * Join a room
   */
  async joinRoom(roomIdOrAlias: string): Promise<string> {
    return this.client.joinRoom(roomIdOrAlias);
  }

  /**
   * Leave a room
   */
  async leaveRoom(roomId: string): Promise<void> {
    await this.client.leaveRoom(roomId);
  }

  /**
   * Get joined rooms
   */
  async getJoinedRooms(): Promise<string[]> {
    return this.client.getJoinedRooms();
  }

  /**
   * Register event handlers on the underlying client
   */
  on(event: string, handler: (...args: unknown[]) => void): void {
    this.client.on(event, handler);
  }

  /**
   * Remove event handlers from the underlying client
   */
  off(event: string, handler: (...args: unknown[]) => void): void {
    this.client.off(event, handler);
  }

  /**
   * Edit a previously sent message
   */
  async editMessage(
    roomId: string,
    eventId: string,
    newText: string,
    newHtml?: string,
  ): Promise<string> {
    const content: Record<string, unknown> = {
      msgtype: "m.text",
      body: `* ${newText}`,
      "m.new_content": {
        msgtype: "m.text",
        body: newText,
      },
      "m.relates_to": {
        rel_type: "m.replace",
        event_id: eventId,
      },
    };

    if (newHtml) {
      content["format"] = "org.matrix.custom.html";
      content["formatted_body"] = `* ${newHtml}`;
      (content["m.new_content"] as Record<string, unknown>)["format"] =
        "org.matrix.custom.html";
      (content["m.new_content"] as Record<string, unknown>)["formatted_body"] =
        newHtml;
    }

    return this.client.sendMessage(roomId, content);
  }

  /**
   * Get the underlying MatrixClient for advanced operations
   */
  getClient(): MatrixClient {
    return this.client;
  }

  /**
   * Check if the client is connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}
