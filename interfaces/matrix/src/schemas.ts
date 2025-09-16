import { z } from "@brains/utils";

/**
 * Per-room rate limit configuration
 */
export const perRoomRateLimitSchema = z.object({
  messages: z.number().int().positive(),
  window: z.number().int().positive(), // in milliseconds
});

/**
 * Matrix interface configuration schema
 */
export const matrixConfigSchema = z.object({
  // Required fields
  homeserver: z.string().url().describe("Matrix homeserver URL"),
  accessToken: z.string().min(1).describe("Matrix access token"),
  userId: z
    .string()
    .regex(/^@.+:.+$/)
    .describe("Matrix user ID"),

  // Optional fields
  deviceId: z.string().optional().describe("Device ID for E2E encryption"),
  deviceDisplayName: z
    .string()
    .optional()
    .describe("Device display name")
    .default("Brain Bot"),
  storageDir: z.string().optional().describe("Directory for state storage"),
  cryptoStorageDir: z
    .string()
    .optional()
    .describe("Directory for crypto storage"),

  // Permission System
  publicToolsOnly: z
    .boolean()
    .describe("Force public-only mode")
    .default(false),

  // Features
  autoJoinRooms: z
    .boolean()
    .describe("Automatically join rooms when invited")
    .default(true),
  enableEncryption: z
    .boolean()
    .describe("Enable E2E encryption support")
    .default(true),
  enableReactions: z
    .boolean()
    .describe("Enable reaction support")
    .default(true),
  enableThreading: z
    .boolean()
    .describe("Enable threading support")
    .default(true),
  enableTypingNotifications: z
    .boolean()
    .describe("Enable typing notifications")
    .default(true),

  // Behavior
  commandPrefix: z
    .string()
    .describe("Command prefix for bot commands")
    .default("!"),
  maxContextMessages: z
    .number()
    .int()
    .positive()
    .describe("Maximum context messages to consider")
    .default(10),
  typingTimeout: z
    .number()
    .int()
    .positive()
    .describe("Typing indicator timeout in ms")
    .default(30000),
  reactionTimeout: z
    .number()
    .int()
    .positive()
    .describe("Reaction timeout in ms")
    .default(60000),

  // Rate limiting
  perRoomRateLimit: perRoomRateLimitSchema
    .optional()
    .describe("Per-room rate limiting configuration"),

  // Base interface config (inherited)
  rateLimitPerMinute: z
    .number()
    .int()
    .positive()
    .describe("Global rate limit per minute")
    .default(60),
  maxRetries: z
    .number()
    .int()
    .min(0)
    .describe("Maximum retry attempts")
    .default(3),
  retryDelay: z
    .number()
    .int()
    .positive()
    .describe("Retry delay in ms")
    .default(1000),
});

/**
 * Type exports
 */
export type MatrixConfig = z.infer<typeof matrixConfigSchema>;
export type PerRoomRateLimit = z.infer<typeof perRoomRateLimitSchema>;
