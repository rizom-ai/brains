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

export interface SlackChatAdapterConfig extends UrlCaptureConfig {
  botToken: string;
  mode: "webhook" | "socket";
  signingSecret?: string | undefined;
  appToken?: string | undefined;
  allowedChannels: string[];
  requireMention: boolean;
  allowDMs: boolean;
  showTypingIndicator: boolean;
}

interface SlackChatAdapterConfigInput extends UrlCaptureConfigInput {
  botToken: string;
  mode?: "webhook" | "socket" | undefined;
  signingSecret?: string | undefined;
  appToken?: string | undefined;
  allowedChannels?: string[] | undefined;
  requireMention?: boolean | undefined;
  allowDMs?: boolean | undefined;
  showTypingIndicator?: boolean | undefined;
}

export interface ChatConfig {
  userName: string;
  adapters: {
    discord?: DiscordChatAdapterConfig | undefined;
    slack?: SlackChatAdapterConfig | undefined;
  };
  gatewayRunMs: number;
  gatewayRestartDelayMs: number;
}

export interface ChatConfigInput {
  userName?: string | undefined;
  adapters?:
    | {
        discord?: DiscordChatAdapterConfigInput | undefined;
        slack?: SlackChatAdapterConfigInput | undefined;
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

const slackAdapterConfigSchema: z.ZodType<
  SlackChatAdapterConfig,
  SlackChatAdapterConfigInput
> = z
  .object({
    botToken: z.string().min(1).describe("Slack bot token"),
    mode: z.enum(["webhook", "socket"]).default("webhook"),
    signingSecret: z
      .string()
      .min(1)
      .optional()
      .describe("Slack signing secret"),
    appToken: z.string().min(1).optional().describe("Slack app-level token"),
    allowedChannels: z.array(z.string()).default([]),
    requireMention: z.boolean().default(true),
    allowDMs: z.boolean().default(true),
    showTypingIndicator: z.boolean().default(true),
    captureUrls: z.boolean().default(false),
    blockedUrlDomains: z.array(z.string()).default(blockedUrlDomainsDefault),
  })
  .superRefine((config, context) => {
    if (config.mode === "webhook" && !config.signingSecret) {
      context.addIssue({
        code: "custom",
        message: "Slack signing secret is required in webhook mode",
        path: ["signingSecret"],
      });
    }
    if (config.mode === "socket" && !config.appToken) {
      context.addIssue({
        code: "custom",
        message: "Slack app token is required in socket mode",
        path: ["appToken"],
      });
    }
  });

export const chatConfigSchema: z.ZodType<ChatConfig, ChatConfigInput> =
  z.object({
    userName: z.string().default("brain"),
    adapters: z
      .object({
        discord: discordAdapterConfigSchema.optional(),
        slack: slackAdapterConfigSchema.optional(),
      })
      .default({}),
    gatewayRunMs: z
      .number()
      .int()
      .positive()
      .default(9 * 60 * 1000),
    gatewayRestartDelayMs: z.number().int().nonnegative().default(1_000),
  });
