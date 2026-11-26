/**
 * Discord adapter options a brain model can set without knowing the
 * deployment's secrets. Everything else comes from brain.yaml.
 */
export interface DiscordChatAdapterDefaults {
  captureUrls?: boolean;
}

/**
 * Wire the Discord and Matrix adapters from the standard env vars, or leave
 * them off.
 *
 * Each adapter needs all of its values, so a partial set yields no adapter
 * rather than a config that fails validation and takes the whole interface
 * down with it. brain.yaml overrides merge on top of whatever this returns.
 */
export function chatConfigFromEnv(
  env: Record<string, string | undefined>,
  discord: DiscordChatAdapterDefaults = {},
): Record<string, unknown> {
  const adapters = {
    ...discordFromEnv(env, discord),
    ...matrixFromEnv(env),
  };
  return Object.keys(adapters).length > 0 ? { adapters } : {};
}

function discordFromEnv(
  env: Record<string, string | undefined>,
  defaults: DiscordChatAdapterDefaults,
): Record<string, unknown> {
  const botToken = env["DISCORD_BOT_TOKEN"];
  const publicKey = env["DISCORD_PUBLIC_KEY"];
  const applicationId = env["DISCORD_APPLICATION_ID"];
  if (!botToken || !publicKey || !applicationId) return {};
  return { discord: { botToken, publicKey, applicationId, ...defaults } };
}

function matrixFromEnv(
  env: Record<string, string | undefined>,
): Record<string, unknown> {
  const baseUrl = env["MATRIX_BASE_URL"];
  const userId = env["MATRIX_USER_ID"];
  const password = env["MATRIX_PASSWORD"];
  if (!baseUrl || !userId || !password) return {};
  return { matrix: { baseUrl, userId, password } };
}
