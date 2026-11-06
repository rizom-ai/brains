import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Env vars consumed via brain.yaml interpolation for the LinkedIn import. */
export const linkedInImportEnvSchema: EnvVarDecl[] = [
  {
    name: "LINKEDIN_IMPORT_CLIENT_ID",
    description: "LinkedIn import",
  },
  {
    name: "LINKEDIN_IMPORT_CLIENT_SECRET",
    sensitive: true,
    description: "LinkedIn import",
  },
  {
    name: "LINKEDIN_IMPORT_BROKER_SECRET",
    sensitive: true,
    description: "LinkedIn import through the managed broker",
  },
];
