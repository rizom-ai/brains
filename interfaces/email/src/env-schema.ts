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
  {
    name: "IMAP_HOST",
    description: "Optional inbound email IMAP server",
  },
  { name: "IMAP_PORT" },
  { name: "IMAP_USER", sensitive: true },
  { name: "IMAP_PASSWORD", sensitive: true },
  {
    name: "IMAP_MAILBOX",
    description: "Inbound mailbox (defaults to INBOX)",
  },
  {
    name: "POLL_MODE",
    description: "Inbound polling mode: idle (default) or interval",
  },
  {
    name: "POLL_INTERVAL_MS",
    description: "Interval polling delay in milliseconds (defaults to 60000)",
  },
];
