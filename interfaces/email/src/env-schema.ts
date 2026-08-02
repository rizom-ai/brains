import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Env vars consumed via brain.yaml interpolation for email credentials. */
export const emailEnvSchema: EnvVarDecl[] = [
  {
    name: "SETUP_EMAIL_TO",
    required: true,
    sensitive: true,
    description: "Passkey setup email via the Email interface",
  },
  { name: "SETUP_EMAIL_API_KEY", required: true, sensitive: true },
  { name: "SETUP_EMAIL_FROM", required: true, sensitive: true },
  {
    name: "IMAP_USER",
    sensitive: true,
    description: "Optional inbound mailbox credential",
  },
  { name: "IMAP_PASSWORD", sensitive: true },
];
