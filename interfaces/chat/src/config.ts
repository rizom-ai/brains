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

type DiscordChatAdapterConfigSchema = z.ZodObject<{
  botToken: z.ZodString;
  publicKey: z.ZodString;
  applicationId: z.ZodString;
  mentionRoleIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
  allowedChannels: z.ZodDefault<z.ZodArray<z.ZodString>>;
  requireMention: z.ZodDefault<z.ZodBoolean>;
  allowDMs: z.ZodDefault<z.ZodBoolean>;
  showTypingIndicator: z.ZodDefault<z.ZodBoolean>;
  useThreads: z.ZodDefault<z.ZodBoolean>;
  captureUrls: z.ZodDefault<z.ZodBoolean>;
  blockedUrlDomains: z.ZodDefault<z.ZodArray<z.ZodString>>;
  captureUrlEmoji: z.ZodDefault<z.ZodString>;
}>;

const discordAdapterConfigSchema: DiscordChatAdapterConfigSchema = z.object({
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

export type DiscordChatAdapterConfig = z.output<
  typeof discordAdapterConfigSchema
>;

type SlackChatAdapterConfigSchema = z.ZodObject<{
  botToken: z.ZodString;
  mode: z.ZodDefault<z.ZodEnum<{ webhook: "webhook"; socket: "socket" }>>;
  signingSecret: z.ZodOptional<z.ZodString>;
  appToken: z.ZodOptional<z.ZodString>;
  allowedChannels: z.ZodDefault<z.ZodArray<z.ZodString>>;
  requireMention: z.ZodDefault<z.ZodBoolean>;
  allowDMs: z.ZodDefault<z.ZodBoolean>;
  showTypingIndicator: z.ZodDefault<z.ZodBoolean>;
  captureUrls: z.ZodDefault<z.ZodBoolean>;
  blockedUrlDomains: z.ZodDefault<z.ZodArray<z.ZodString>>;
}>;

const slackAdapterConfigSchema: SlackChatAdapterConfigSchema = z
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

export type SlackChatAdapterConfig = z.output<typeof slackAdapterConfigSchema>;

type ChatConfigSchema = z.ZodObject<{
  userName: z.ZodDefault<z.ZodString>;
  adapters: z.ZodDefault<
    z.ZodObject<{
      discord: z.ZodOptional<DiscordChatAdapterConfigSchema>;
      slack: z.ZodOptional<SlackChatAdapterConfigSchema>;
    }>
  >;
  gatewayRunMs: z.ZodDefault<z.ZodNumber>;
  gatewayRestartDelayMs: z.ZodDefault<z.ZodNumber>;
}>;

export const chatConfigSchema: ChatConfigSchema = z
  .object({
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
  })
  .superRefine((config, context) => {
    // An adapterless interface would register webhook routes that only ever
    // 404. The resolver reads this as "missing required config" and skips the
    // interface, which is what a brain with no chat credentials wants.
    if (!config.adapters.discord && !config.adapters.slack) {
      context.addIssue({
        code: "custom",
        message: "At least one chat adapter must be configured",
        path: ["adapters"],
      });
    }
  });

export type ChatConfig = z.output<typeof chatConfigSchema>;
export type ChatConfigInput = z.input<typeof chatConfigSchema>;
