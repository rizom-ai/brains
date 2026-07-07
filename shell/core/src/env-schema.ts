/**
 * Shell Env Schema Aggregation
 *
 * Collects the env-var declarations of every shell service wired into a
 * brain, in the order they appear in the operator-facing `.env.schema`.
 * `scripts/sync-env-templates.ts` renders this into each brain's
 * `env.schema.template`; a drift test keeps the two in sync, so adding a
 * shell env var is a single edit in the owning service's env-schema.ts.
 */

import { aiServiceEnvSchema } from "@brains/ai-service";
import type { EnvVarDecl } from "@brains/utils/env-schema";

/**
 * Env vars for the shell services a given model wires in. The model
 * parameter exists because bundle composition decides which services
 * run; today the declared services are part of every brain.
 */
export function shellEnvVars(_model: string): EnvVarDecl[] {
  return [...aiServiceEnvSchema];
}
