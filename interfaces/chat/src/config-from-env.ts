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
 * takes the whole interface — Slack included — down with it. brain.yaml
 * overrides merge on top of whatever this returns.
 */
export function chatConfigFromEnv(
  env: Record<string, string | undefined>,
  discord: DiscordChatAdapterDefaults = {},
): Record<string, unknown> {
  const botToken = env["DISCORD_BOT_TOKEN"];
  const publicKey = env["DISCORD_PUBLIC_KEY"];
  const applicationId = env["DISCORD_APPLICATION_ID"];
  if (!botToken || !publicKey || !applicationId) return {};
  return {
    adapters: {
      discord: { botToken, publicKey, applicationId, ...discord },
    },
  };
}
