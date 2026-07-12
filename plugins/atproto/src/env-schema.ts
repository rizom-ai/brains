import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Env vars the brain composition reads into the ATProto plugin config. */
export const atprotoEnvSchema: EnvVarDecl[] = [
  {
    name: "ATPROTO_APP_PASSWORD",
    sensitive: true,
    description: "AT Protocol publishing/discovery (optional)",
  },
];
