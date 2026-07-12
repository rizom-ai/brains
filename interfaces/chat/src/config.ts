import { z } from "@brains/utils/zod";

const blockedUrlDomainsDefault: string[] = [
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

interface UrlCaptureConfig {
  captureUrls: boolean;
  blockedUrlDomains: string[];
}

interface UrlCaptureConfigInput {
  captureUrls?: boolean | undefined;
  blockedUrlDomains?: string[] | undefined;
}

export interface DiscordChatAdapterConfig extends UrlCaptureConfig {
  botToken: string;
  publicKey: string;
  applicationId: string;
  mentionRoleIds: string[];
  allowedChannels: string[];
  requireMention: boolean;
  allowDMs: boolean;
  showTypingIndicator: boolean;
  useThreads: boolean;
  captureUrlEmoji: string;
}

interface DiscordChatAdapterConfigInput extends UrlCaptureConfigInput {
  botToken: string;
  publicKey: string;
  applicationId: string;
  mentionRoleIds?: string[] | undefined;
  allowedChannels?: string[] | undefined;
  requireMention?: boolean | undefined;
  allowDMs?: boolean | undefined;
  showTypingIndicator?: boolean | undefined;
  useThreads?: boolean | undefined;
  captureUrlEmoji?: string | undefined;
}

export interface ChatConfig {
  userName: string;
  adapters: {
    discord?: DiscordChatAdapterConfig | undefined;
  };
  gatewayRunMs: number;
  gatewayRestartDelayMs: number;
}

export interface ChatConfigInput {
  userName?: string | undefined;
  adapters?:
    | {
        discord?: DiscordChatAdapterConfigInput | undefined;
      }
    | undefined;
  gatewayRunMs?: number | undefined;
  gatewayRestartDelayMs?: number | undefined;
}

const discordAdapterConfigSchema: z.ZodType<
  DiscordChatAdapterConfig,
  DiscordChatAdapterConfigInput
> = z.object({
  botToken: z.string().min(1).describe("Discord bot token"),
  publicKey: z.string().min(1).describe("Discord application public key"),
  applicationId: z.string().min(1).describe("Discord application ID"),
  mentionRoleIds: z.array(z.string()).default([]),
  allowedChannels: z.array(z.string()).default([]),
  requireMention: z.boolean().default(true),
  allowDMs: z.boolean().default(true),
  showTypingIndicator: z.boolean().default(true),
  useThreads: z.boolean().default(true),
  captureUrls: z.boolean().default(false),
  blockedUrlDomains: z.array(z.string()).default(blockedUrlDomainsDefault),
  captureUrlEmoji: z.string().default("🔖"),
});

export const chatConfigSchema: z.ZodType<ChatConfig, ChatConfigInput> =
  z.object({
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
