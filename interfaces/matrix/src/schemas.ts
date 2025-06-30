import { z } from "zod";

/**
 * Default values for Matrix configuration
 */
export const MATRIX_CONFIG_DEFAULTS = {
  deviceDisplayName: process.env["MATRIX_DISPLAY_NAME"] || "Personal Brain",
  publicToolsOnly: false,
  autoJoinRooms: true,
  enableEncryption: true,
  enableReactions: true,
  enableThreading: true,
  enableTypingNotifications: true,
  commandPrefix: "!",
  anchorPrefix: "!!",
  maxContextMessages: 10,
  typingTimeout: 30000,
  reactionTimeout: 60000,
  rateLimitPerMinute: 60,
  maxRetries: 3,
  retryDelay: 1000,
} as const;

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
  publicToolsOnly: z.boolean().describe("Force public-only mode"),

  // Features
  autoJoinRooms: z.boolean().describe("Automatically join rooms when invited"),
  enableEncryption: z.boolean().describe("Enable E2E encryption support"),
  enableReactions: z.boolean().describe("Enable reaction support"),
  enableThreading: z.boolean().describe("Enable threading support"),
  enableTypingNotifications: z
    .boolean()
    .describe("Enable typing notifications"),

  // Behavior
  commandPrefix: z.string().describe("Command prefix for bot commands"),
  anchorPrefix: z.string().describe("Prefix for anchor-only commands"),
  maxContextMessages: z
    .number()
    .int()
    .positive()
    .describe("Maximum context messages to consider"),
  typingTimeout: z
    .number()
    .int()
    .positive()
    .describe("Typing indicator timeout in ms"),
  reactionTimeout: z
    .number()
    .int()
    .positive()
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
    .describe("Global rate limit per minute"),
  maxRetries: z.number().int().min(0).describe("Maximum retry attempts"),
  retryDelay: z.number().int().positive().describe("Retry delay in ms"),
});

/**
 * Type exports
 */
export type MatrixConfig = z.infer<typeof matrixConfigSchema>;
export type MatrixConfigInput = Partial<MatrixConfig>;
export type PerRoomRateLimit = z.infer<typeof perRoomRateLimitSchema>;
