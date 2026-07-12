import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Env vars consumed via brain.yaml interpolation for Unsplash. */
export const stockPhotoEnvSchema: EnvVarDecl[] = [
  { name: "UNSPLASH_ACCESS_KEY", sensitive: true, description: "Stock photo" },
];
