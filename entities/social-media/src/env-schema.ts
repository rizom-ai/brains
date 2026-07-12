import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Env vars consumed via brain.yaml interpolation for LinkedIn publishing. */
export const socialMediaEnvSchema: EnvVarDecl[] = [
  { name: "LINKEDIN_ACCESS_TOKEN", sensitive: true, description: "LinkedIn" },
  { name: "LINKEDIN_ORGANIZATION_ID", sensitive: true },
];
