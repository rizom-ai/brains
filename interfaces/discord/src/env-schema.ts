import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Env vars consumed via brain.yaml interpolation for the Discord bot. */
export const discordEnvSchema: EnvVarDecl[] = [
  { name: "DISCORD_BOT_TOKEN", sensitive: true },
];
