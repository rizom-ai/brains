import type { EnvVarDecl } from "@brains/utils/env-schema";
import { KEY_PROVIDER_IDS, keyEnvVar, PROVIDERS } from "./providers";

/**
 * Env vars the AI service consumes. The app layer reads these
 * (`shell/app/src/ai-config.ts`) and passes explicit config into the
 * service; declaring them here keeps the operator-facing `.env.schema`
 * in sync with what the runtime actually uses.
 *
 * Each provider has its own key. Which ones a brain needs follows from the
 * models it names in `brain.yaml`.
 */
export const aiServiceEnvSchema: EnvVarDecl[] = KEY_PROVIDER_IDS.map(
  (provider) => ({
    name: keyEnvVar(provider),
    sensitive: true,
    description: `${PROVIDERS[provider].label} API key, for its models`,
  }),
);
