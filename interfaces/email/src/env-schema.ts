import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Env vars consumed via brain.yaml interpolation for setup email delivery. */
export const emailEnvSchema: EnvVarDecl[] = [
  {
    name: "SETUP_EMAIL_TO",
    required: true,
    sensitive: true,
    description: "Passkey setup email via the Email interface",
  },
  { name: "SETUP_EMAIL_API_KEY", required: true, sensitive: true },
  { name: "SETUP_EMAIL_FROM", required: true, sensitive: true },
];
