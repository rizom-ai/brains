/**
 * Discord adapter options a brain model can set without knowing the
 * deployment's secrets. Everything else comes from brain.yaml.
 */
export interface DiscordChatAdapterDefaults {
  captureUrls?: boolean;
}

/**
 * Wire the Discord adapter from the standard env vars, or leave it off.
 *
 * All three credentials are required by the Chat SDK adapter, so a partial
 * set yields no adapter at all rather than a config that fails validation and
 * takes the whole interface — Slack included — down with it.
 */
function discordFromEnv(
  env: Record<string, string | undefined>,
  defaults: DiscordChatAdapterDefaults,
): Record<string, unknown> | undefined {
  const botToken = env["DISCORD_BOT_TOKEN"];
  const publicKey = env["DISCORD_PUBLIC_KEY"];
  const applicationId = env["DISCORD_APPLICATION_ID"];
  if (!botToken || !publicKey || !applicationId) return undefined;
  return { botToken, publicKey, applicationId, ...defaults };
}

/**
 * Wire WhatsApp from the brain's number. Operators write numbers with spaces
 * and a leading +; the adapter takes digits only.
 */
function whatsappFromEnv(
  env: Record<string, string | undefined>,
): Record<string, unknown> | undefined {
  const phoneNumber = (env["WHATSAPP_PHONE_NUMBER"] ?? "").replace(/\D/g, "");
  return phoneNumber ? { phoneNumber } : undefined;
}

/**
 * Wire the chat adapters the standard env vars configure, or leave them off.
 * brain.yaml overrides merge on top of whatever this returns.
 */
export function chatConfigFromEnv(
  env: Record<string, string | undefined>,
  discord: DiscordChatAdapterDefaults = {},
): Record<string, unknown> {
  const discordConfig = discordFromEnv(env, discord);
  const whatsappConfig = whatsappFromEnv(env);
  if (!discordConfig && !whatsappConfig) return {};
  return {
    adapters: {
      ...(discordConfig ? { discord: discordConfig } : {}),
      ...(whatsappConfig ? { whatsapp: whatsappConfig } : {}),
    },
  };
}
