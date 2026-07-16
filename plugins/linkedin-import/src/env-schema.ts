import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Env vars consumed by LinkedIn member-data portability imports. */
export const linkedinImportEnvSchema: EnvVarDecl[] = [
  {
    name: "LINKEDIN_ACCESS_TOKEN",
    sensitive: true,
    description: "LinkedIn member data portability",
  },
];
