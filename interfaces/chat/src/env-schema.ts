import type { EnvVarDecl } from "@brains/utils/env-schema";

/**
 * Env vars consumed via brain.yaml interpolation for chat adapters.
 * Discord's token stays declared by @brains/discord until that
 * interface is folded into this package.
 */
export const chatEnvSchema: EnvVarDecl[] = [
  { name: "SLACK_BOT_TOKEN", sensitive: true },
  { name: "SLACK_APP_TOKEN", sensitive: true },
];
