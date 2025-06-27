import type { z } from "zod";
import { matrixConfigSchema } from "./schemas";

/**
 * Configuration builder for Matrix interface
 */
class MatrixConfigBuilder {
  private config: Partial<z.infer<typeof matrixConfigSchema>> = {};

  /**
   * Set the Matrix homeserver URL
   */
  homeserver(url: string): this {
    this.config.homeserver = url;
    return this;
  }

  /**
   * Set the access token
   */
  accessToken(token: string): this {
    this.config.accessToken = token;
    return this;
  }

  /**
   * Set the bot user ID
   */
  userId(id: string): this {
    this.config.userId = id;
    return this;
  }

  /**
   * Set the anchor user ID (primary user with full access)
   */
  anchorUserId(id: string): this {
    this.config.anchorUserId = id;
    return this;
  }

  /**
   * Set device ID for E2E encryption
   */
  deviceId(id: string): this {
    this.config.deviceId = id;
    return this;
  }

  /**
   * Set device display name
   */
  deviceDisplayName(name: string): this {
    this.config.deviceDisplayName = name;
    return this;
  }

  /**
   * Set storage directory for state
   */
  storageDir(dir: string): this {
    this.config.storageDir = dir;
    return this;
  }

  /**
   * Set storage directory for crypto keys
   */
  cryptoStorageDir(dir: string): this {
    this.config.cryptoStorageDir = dir;
    return this;
  }

  /**
   * Add trusted users
   */
  trustedUsers(users: string[]): this {
    this.config.trustedUsers = users;
    return this;
  }

  /**
   * Force public-only mode
   */
  publicOnly(enabled = true): this {
    this.config.publicToolsOnly = enabled;
    return this;
  }

  /**
   * Enable/disable auto-join rooms
   */
  autoJoin(enabled = true): this {
    this.config.autoJoinRooms = enabled;
    return this;
  }

  /**
   * Enable/disable E2E encryption
   */
  encryption(enabled = true): this {
    this.config.enableEncryption = enabled;
    return this;
  }

  /**
   * Enable/disable reactions
   */
  reactions(enabled = true): this {
    this.config.enableReactions = enabled;
    return this;
  }

  /**
   * Enable/disable threading
   */
  threading(enabled = true): this {
    this.config.enableThreading = enabled;
    return this;
  }

  /**
   * Enable/disable typing notifications
   */
  typingNotifications(enabled = true): this {
    this.config.enableTypingNotifications = enabled;
    return this;
  }

  /**
   * Set command prefix
   */
  commandPrefix(prefix: string): this {
    this.config.commandPrefix = prefix;
    return this;
  }

  /**
   * Set anchor command prefix
   */
  anchorPrefix(prefix: string): this {
    this.config.anchorPrefix = prefix;
    return this;
  }

  /**
   * Set max context messages
   */
  maxContext(messages: number): this {
    this.config.maxContextMessages = messages;
    return this;
  }

  /**
   * Set typing timeout
   */
  typingTimeout(ms: number): this {
    this.config.typingTimeout = ms;
    return this;
  }

  /**
   * Set reaction timeout
   */
  reactionTimeout(ms: number): this {
    this.config.reactionTimeout = ms;
    return this;
  }

  /**
   * Set per-room rate limit
   */
  perRoomRateLimit(messages: number, windowMs: number): this {
    this.config.perRoomRateLimit = { messages, window: windowMs };
    return this;
  }

  /**
   * Set global rate limit per minute
   */
  rateLimit(perMinute: number): this {
    this.config.rateLimitPerMinute = perMinute;
    return this;
  }

  /**
   * Set retry configuration
   */
  retries(maxRetries: number, delayMs?: number): this {
    this.config.maxRetries = maxRetries;
    if (delayMs !== undefined) {
      this.config.retryDelay = delayMs;
    }
    return this;
  }

  /**
   * Build and validate the configuration
   */
  build(): z.infer<typeof matrixConfigSchema> {
    return matrixConfigSchema.parse(this.config);
  }
}

/**
 * Create a new Matrix configuration builder
 */
export function matrixConfig(): MatrixConfigBuilder {
  return new MatrixConfigBuilder();
}
