import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Env vars consumed via brain.yaml interpolation for Buttondown. */
export const newsletterEnvSchema: EnvVarDecl[] = [
  { name: "BUTTONDOWN_API_KEY", sensitive: true, description: "Newsletter" },
];
