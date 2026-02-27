import { z } from "@brains/utils";

/**
 * Discord interface configuration schema
 */
export const discordConfigSchema = z.object({
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
    .union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)])
    .default(1440),
});

export type DiscordConfig = z.infer<typeof discordConfigSchema>;
