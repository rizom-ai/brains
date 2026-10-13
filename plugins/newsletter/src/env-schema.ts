import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Env vars consumed via brain.yaml interpolation for newsletter providers. */
export const newsletterEnvSchema: EnvVarDecl[] = [
  {
    name: "BUTTONDOWN_API_KEY",
    sensitive: true,
    description: "Buttondown newsletter API key",
  },
  {
    name: "RESEND_API_KEY",
    sensitive: true,
    description: "Resend newsletter API key",
  },
  {
    name: "RESEND_NEWSLETTER_SEGMENT_ID",
    description: "Resend Segment used for newsletter subscribers",
  },
  {
    name: "RESEND_NEWSLETTER_FROM",
    description: "Verified Resend newsletter sender",
  },
  {
    name: "RESEND_NEWSLETTER_REPLY_TO",
    description: "Optional Resend newsletter reply-to address",
  },
  {
    name: "RESEND_NEWSLETTER_TOPIC_ID",
    description: "Optional Resend newsletter Topic ID",
  },
];
