import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Env vars the brain composition reads into the CMS plugin config. */
export const cmsEnvSchema: EnvVarDecl[] = [
  {
    name: "CMS_CONTENT_REPO_PAT",
    required: true,
    sensitive: true,
    description:
      "CMS passkey login GitHub token. Fine-grained PAT with contents:write on the content repo.",
  },
];
