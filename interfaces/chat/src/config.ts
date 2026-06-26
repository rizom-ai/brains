import { z } from "@brains/utils/zod-v4";

const blockedUrlDomainsDefault = [
  "meet.google.com",
  "zoom.us",
  "teams.microsoft.com",
  "whereby.com",
  "gather.town",
  "calendly.com",
  "cal.com",
  "discord.com",
  "discord.gg",
  "cdn.discordapp.com",
  "media.discordapp.net",
  "giphy.com",
  "tenor.com",
  "wetransfer.com",
  "file.io",
];

const urlCaptureConfigSchema = z.object({
  captureUrls: z.boolean().default(false),
  blockedUrlDomains: z.array(z.string()).default(blockedUrlDomainsDefault),
});

const discordAdapterConfigSchema = z.object({
  botToken: z.string().min(1).describe("Discord bot token"),
  publicKey: z.string().min(1).describe("Discord application public key"),
  applicationId: z.string().min(1).describe("Discord application ID"),
  mentionRoleIds: z.array(z.string()).default([]),
  allowedChannels: z.array(z.string()).default([]),
  requireMention: z.boolean().default(true),
  allowDMs: z.boolean().default(true),
  showTypingIndicator: z.boolean().default(true),
  useThreads: z.boolean().default(true),
  ...urlCaptureConfigSchema.shape,
  captureUrlEmoji: z.string().default("🔖"),
});

export const chatConfigSchema = z.object({
  userName: z.string().default("brain"),
  adapters: z
    .object({
      discord: discordAdapterConfigSchema.optional(),
    })
    .default({}),
  gatewayRunMs: z
    .number()
    .int()
    .positive()
    .default(9 * 60 * 1000),
  gatewayRestartDelayMs: z.number().int().nonnegative().default(1_000),
});

export type ChatConfig = z.output<typeof chatConfigSchema>;
export type ChatConfigInput = z.input<typeof chatConfigSchema>;
export type DiscordChatAdapterConfig = z.output<
  typeof discordAdapterConfigSchema
>;
