import type { EnvVarDecl } from "@brains/utils/env-schema";

/**
 * Env vars the AI service consumes. The app layer reads these
 * (`shell/app/src/ai-config.ts`) and passes explicit config into the
 * service; declaring them here keeps the operator-facing `.env.schema`
 * in sync with what the runtime actually uses.
 *
 * Each provider has its own key; `brain.yaml` `model`, `embeddingModel`
 * and `imageModel` decide which providers a brain needs.
 */
export const aiServiceEnvSchema: EnvVarDecl[] = [
  {
    name: "OPENAI_API_KEY",
    sensitive: true,
    description: "OpenAI (embeddings; chat and images when an OpenAI model)",
  },
  {
    name: "ANTHROPIC_API_KEY",
    sensitive: true,
    description: "Anthropic (chat when a Claude model)",
  },
  {
    name: "GOOGLE_GENERATIVE_AI_API_KEY",
    sensitive: true,
    description: "Google (chat and images when a Gemini model)",
  },
  {
    name: "AI_API_KEY",
    sensitive: true,
    description: "Legacy: used for any provider whose own key above is unset",
  },
  {
    name: "AI_IMAGE_KEY",
    sensitive: true,
    description: "Legacy: image key when the image provider's own key is unset",
  },
];
