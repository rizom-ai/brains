import { z } from "zod";

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
  anchorUserId: z
    .string()
    .regex(/^@.+:.+$/)
    .describe("Primary user with full access"),

  // Optional fields
  deviceId: z.string().optional().describe("Device ID for E2E encryption"),
  deviceDisplayName: z.string().optional().describe("Device display name"),
  storageDir: z.string().optional().describe("Directory for state storage"),
  cryptoStorageDir: z
    .string()
    .optional()
    .describe("Directory for crypto storage"),

  // Permission System
  trustedUsers: z
    .array(z.string().regex(/^@.+:.+$/))
    .optional()
    .describe("Additional trusted users"),
  publicToolsOnly: z
    .boolean()
    .optional()
    .default(false)
    .describe("Force public-only mode"),

  // Features
  autoJoinRooms: z
    .boolean()
    .optional()
    .default(true)
    .describe("Automatically join rooms when invited"),
  enableEncryption: z
    .boolean()
    .optional()
    .default(true)
    .describe("Enable E2E encryption support"),
  enableReactions: z
    .boolean()
    .optional()
    .default(true)
    .describe("Enable reaction support"),
  enableThreading: z
    .boolean()
    .optional()
    .default(true)
    .describe("Enable threading support"),
  enableTypingNotifications: z
    .boolean()
    .optional()
    .default(true)
    .describe("Enable typing notifications"),

  // Behavior
  commandPrefix: z
    .string()
    .optional()
    .default("!")
    .describe("Command prefix for bot commands"),
  anchorPrefix: z
    .string()
    .optional()
    .default("!!")
    .describe("Prefix for anchor-only commands"),
  maxContextMessages: z
    .number()
    .int()
    .positive()
    .optional()
    .default(10)
    .describe("Maximum context messages to consider"),
  typingTimeout: z
    .number()
    .int()
    .positive()
    .optional()
    .default(30000)
    .describe("Typing indicator timeout in ms"),
  reactionTimeout: z
    .number()
    .int()
    .positive()
    .optional()
    .default(60000)
    .describe("Reaction timeout in ms"),

  // Rate limiting
  perRoomRateLimit: perRoomRateLimitSchema
    .optional()
    .describe("Per-room rate limiting configuration"),

  // Base interface config (inherited)
  rateLimitPerMinute: z
    .number()
    .int()
    .positive()
    .optional()
    .default(60)
    .describe("Global rate limit per minute"),
  maxRetries: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(3)
    .describe("Maximum retry attempts"),
  retryDelay: z
    .number()
    .int()
    .positive()
    .optional()
    .default(1000)
    .describe("Retry delay in ms"),
});

/**
 * Type exports
 */
export type MatrixConfig = z.infer<typeof matrixConfigSchema>;
export type PerRoomRateLimit = z.infer<typeof perRoomRateLimitSchema>;
