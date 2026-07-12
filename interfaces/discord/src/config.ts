import { urlCaptureConfigSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export interface DiscordConfig {
  botToken: string;
  allowedChannels: string[];
  requireMention: boolean;
  allowDMs: boolean;
  showTypingIndicator: boolean;
  statusMessage: string;
  useThreads: boolean;
  threadAutoArchive: 60 | 1440 | 4320 | 10080;
  captureUrls: boolean;
  blockedUrlDomains: string[];
  captureUrlEmoji: string;
}

export interface DiscordConfigInput {
  botToken: string;
  allowedChannels?: string[] | undefined;
  requireMention?: boolean | undefined;
  allowDMs?: boolean | undefined;
  showTypingIndicator?: boolean | undefined;
  statusMessage?: string | undefined;
  useThreads?: boolean | undefined;
  threadAutoArchive?: 60 | 1440 | 4320 | 10080 | undefined;
  captureUrls?: boolean | undefined;
  blockedUrlDomains?: string[] | undefined;
  captureUrlEmoji?: string | undefined;
}

/**
 * Discord interface configuration schema
 */
export const discordConfigSchema: z.ZodType<DiscordConfig, DiscordConfigInput> =
  z.object({
    /** Discord bot token */
    botToken: z.string().min(1).describe("Discord bot token"),
    /** Allowed channel IDs (empty = all channels) */
    allowedChannels: z.array(z.string()).default([]),
    /** Whether to respond only when mentioned in server channels */
    requireMention: z.boolean().default(true),
    /** Whether to respond to DMs */
    allowDMs: z.boolean().default(true),
    /** Show typing indicator during processing */
    showTypingIndicator: z.boolean().default(true),
    /** Status message displayed on bot's profile */
    statusMessage: z.string().default("Mention me to chat"),
    /** Auto-create threads for bot replies in server channels */
    useThreads: z.boolean().default(true),
    /** Thread auto-archive duration in minutes: 60=1h, 1440=1d, 4320=3d, 10080=7d */
    threadAutoArchive: z
      .union([
        z.literal(60),
        z.literal(1440),
        z.literal(4320),
        z.literal(10080),
      ])
      .default(1440),
    // URL capture (shared config) + Discord-specific emoji reaction
    ...urlCaptureConfigSchema.shape,
    /** Emoji to react with when capturing a URL */
    captureUrlEmoji: z.string().default("🔖"),
  });

/**
 * Raw config passed by the brain model resolver after env/default config and
 * brain.yaml plugin overrides have been merged. Required secrets such as
 * botToken may be supplied by that dynamic merge, so the constructor accepts
 * this pre-parse framework boundary and lets the schema validate it.
 */
export type DiscordConstructorConfig = Record<string, unknown>;
