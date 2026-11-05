import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Env vars consumed via brain.yaml interpolation for the LinkedIn import. */
export const linkedInImportEnvSchema: EnvVarDecl[] = [
  {
    name: "LINKEDIN_PORTABILITY_TOKEN",
    sensitive: true,
    description: "LinkedIn import",
  },
];
