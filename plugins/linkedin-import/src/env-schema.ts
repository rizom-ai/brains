import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Explicit self-hosted/direct LinkedIn OAuth configuration. */
export const linkedinDirectOAuthEnvSchema: EnvVarDecl[] = [
  {
    name: "LINKEDIN_DIRECT_CLIENT_ID",
    description: "Direct LinkedIn portability OAuth application client ID",
  },
  {
    name: "LINKEDIN_DIRECT_CLIENT_SECRET",
    sensitive: true,
    description: "Direct LinkedIn portability OAuth application client secret",
  },
  {
    name: "LINKEDIN_DIRECT_REDIRECT_URI",
    description:
      "Direct callback URL ending in /linkedin/oauth/direct/callback",
  },
];

/** Env vars consumed by LinkedIn member-data portability imports. */
export const linkedinImportEnvSchema: EnvVarDecl[] = [
  {
    name: "LINKEDIN_ACCESS_TOKEN",
    sensitive: true,
    description: "LinkedIn member data portability",
  },
  ...linkedinDirectOAuthEnvSchema,
];
