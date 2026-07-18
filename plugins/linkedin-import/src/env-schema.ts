import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Browser OAuth configuration for LinkedIn member-data portability. */
export const linkedinOAuthEnvSchema: EnvVarDecl[] = [
  {
    name: "LINKEDIN_CLIENT_ID",
    description: "LinkedIn portability OAuth application client ID",
  },
  {
    name: "LINKEDIN_CLIENT_SECRET",
    sensitive: true,
    description: "LinkedIn portability OAuth application client secret",
  },
  {
    name: "LINKEDIN_REDIRECT_URI",
    description:
      "Registered LinkedIn callback URL ending in /linkedin/callback",
  },
];

/** Env vars consumed by LinkedIn member-data portability imports. */
export const linkedinImportEnvSchema: EnvVarDecl[] = [
  {
    name: "LINKEDIN_ACCESS_TOKEN",
    sensitive: true,
    description: "LinkedIn member data portability",
  },
  ...linkedinOAuthEnvSchema,
];
