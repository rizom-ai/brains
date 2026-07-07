import type { EnvVarDecl } from "@brains/utils/env-schema";

/**
 * Env vars the AI service consumes. The app layer reads these
 * (`shell/app/src/ai-config.ts`) and passes explicit config into the
 * service; declaring them here keeps the operator-facing `.env.schema`
 * in sync with what the runtime actually uses.
 */
export const aiServiceEnvSchema: EnvVarDecl[] = [
  {
    name: "AI_API_KEY",
    required: true,
    sensitive: true,
    description: "AI provider",
  },
  {
    name: "AI_IMAGE_KEY",
    sensitive: true,
    description:
      "Optional: separate key for image generation (defaults to AI_API_KEY)",
  },
];
