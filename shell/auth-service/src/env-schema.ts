import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Deployment secret used only when per-account plugin settings are installed. */
export const authServiceEnvSchema: EnvVarDecl[] = [
  {
    name: "ACCOUNT_SETTINGS_ENCRYPTION_KEY",
    sensitive: true,
    description:
      "Per-account plugin settings encryption (required when account settings are installed)",
  },
];
