/**
 * Resolve AI configuration from environment and brain.yaml overrides.
 *
 * Env vars:
 *   AI_API_KEY   — primary key for text generation (and images if no override)
 *   AI_IMAGE_KEY — optional override for image generation (different provider)
 *   MODEL_RUNTIME_URL — the model runtime a deploy runs beside the brain
 *
 * The model fields determine the provider (resolved by AI service at runtime).
 */

import type { ReasoningEffort } from "./types";

/** Fields that resolveAIConfig adds to AppConfig */
export interface AIConfigFields {
  aiApiKey?: string;
  aiImageKey?: string;
  aiModel?: string;
  aiEmbeddingModel?: string;
  aiModelRuntimeUrl?: string;
  aiReasoningEffort?: ReasoningEffort;
}

export function resolveAIConfig(
  env: Record<string, string | undefined>,
  overrides?: {
    model?: string;
    embeddingModel?: string;
    modelRuntimeUrl?: string;
    reasoningEffort?: ReasoningEffort;
  },
): AIConfigFields {
  const apiKey = env["AI_API_KEY"];
  const imageKey = env["AI_IMAGE_KEY"];

  const result: AIConfigFields = {};

  if (apiKey) {
    result.aiApiKey = apiKey;
  }
  if (imageKey) {
    result.aiImageKey = imageKey;
  }

  // Models keep an explicit provider prefix ("openai:gpt-4o-mini"); the AI
  // service resolves the provider from it, or from the bare model name.
  if (overrides?.model) {
    result.aiModel = overrides.model;
  }
  if (overrides?.embeddingModel) {
    result.aiEmbeddingModel = overrides.embeddingModel;
  }
  // brain.yaml names the model runtime, or the deploy that runs one beside
  // the brain does.
  const modelRuntimeUrl =
    overrides?.modelRuntimeUrl ?? env["MODEL_RUNTIME_URL"];
  if (modelRuntimeUrl) {
    result.aiModelRuntimeUrl = modelRuntimeUrl;
  }
  if (overrides?.reasoningEffort) {
    result.aiReasoningEffort = overrides.reasoningEffort;
  }

  return result;
}
