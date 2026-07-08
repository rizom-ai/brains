/**
 * Shell Env Schema Aggregation
 *
 * Collects the env-var declarations of the shell services every brain
 * runs. Each brain composes these with its plugin declarations in its
 * own `src/env-schema.ts`; `scripts/sync-env-templates.ts` renders the
 * composition into `env.schema.template`, and a drift check keeps them
 * in sync — so adding a shell env var is a single edit in the owning
 * service's env-schema.ts.
 */

import { aiServiceEnvSchema } from "@brains/ai-service/env-schema";
import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Env vars for the shell services that are part of every brain. */
export function shellEnvVars(): EnvVarDecl[] {
  return [...aiServiceEnvSchema];
}
