import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Env vars consumed via brain.yaml interpolation for setup email delivery. */
export const emailResendEnvSchema: EnvVarDecl[] = [
  {
    name: "SETUP_EMAIL_TO",
    required: true,
    sensitive: true,
    description: "Passkey setup email via Resend",
  },
  { name: "SETUP_EMAIL_API_KEY", required: true, sensitive: true },
  { name: "SETUP_EMAIL_FROM", required: true, sensitive: true },
];
