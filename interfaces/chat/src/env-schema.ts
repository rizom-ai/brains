import type { EnvVarDecl } from "@brains/utils/env-schema";

/**
 * Env vars consumed via brain.yaml interpolation for chat adapters.
 * The Discord adapter needs all three: the bot token authenticates the
 * gateway connection, the public key verifies interaction signatures, and
 * the application id identifies the bot to the Chat SDK. WhatsApp needs only
 * the brain's number; the session itself comes from pairing.
 */
export const chatEnvSchema: EnvVarDecl[] = [
  { name: "DISCORD_BOT_TOKEN", sensitive: true },
  { name: "DISCORD_PUBLIC_KEY" },
  { name: "DISCORD_APPLICATION_ID" },
  { name: "SLACK_BOT_TOKEN", sensitive: true },
  { name: "SLACK_APP_TOKEN", sensitive: true },
  { name: "WHATSAPP_PHONE_NUMBER" },
];
