import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Env vars consumed via brain.yaml interpolation for git sync auth. */
export const directorySyncEnvSchema: EnvVarDecl[] = [
  {
    name: "GIT_SYNC_TOKEN",
    required: true,
    sensitive: true,
    description: "Git sync",
  },
];
