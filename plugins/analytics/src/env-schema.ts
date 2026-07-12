import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Env vars consumed via brain.yaml interpolation for Cloudflare analytics. */
export const analyticsEnvSchema: EnvVarDecl[] = [
  {
    name: "CLOUDFLARE_ACCOUNT_ID",
    sensitive: true,
    description: "Cloudflare analytics",
  },
  { name: "CLOUDFLARE_API_TOKEN", sensitive: true },
  { name: "CLOUDFLARE_ANALYTICS_SITE_TAG" },
];
