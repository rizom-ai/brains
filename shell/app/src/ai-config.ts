/**
 * Resolve AI configuration from environment and brain.yaml overrides.
 *
 * Env vars:
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY — each
 *     provider's own key; a model runs only on a provider with one
 *   MODEL_RUNTIME_URL — the model runtime a deploy runs beside the brain
 *
 * The model fields determine the provider (resolved by AI service at runtime).
 */

import { readProviderKeys, type ProviderKeys } from "@brains/core";
import type { ReasoningEffort } from "./types";

/** Fields that resolveAIConfig adds to AppConfig */
export interface AIConfigFields {
  aiProviderKeys?: ProviderKeys;
  aiModel?: string;
  aiEmbeddingModel?: string;
  aiModelRuntimeUrl?: string;
  aiAnswerModel?: string;
  aiVisionModel?: string;
  aiImageModel?: string;
  aiReasoningEffort?: ReasoningEffort;
}

export function resolveAIConfig(
  env: Record<string, string | undefined>,
  overrides?: {
    model?: string;
    embeddingModel?: string;
    modelRuntimeUrl?: string;
    answerModel?: string;
    visionModel?: string;
    imageModel?: string;
    reasoningEffort?: ReasoningEffort;
  },
): AIConfigFields {
  const result: AIConfigFields = {};

  const providerKeys = readProviderKeys(env);
  if (Object.keys(providerKeys).length > 0) {
    result.aiProviderKeys = providerKeys;
  }

  // Models keep an explicit provider prefix ("openai:gpt-4o-mini"); the AI
  // service resolves the provider from it, or from the bare model name.
  if (overrides?.model) {
    result.aiModel = overrides.model;
  }
  if (overrides?.embeddingModel) {
    result.aiEmbeddingModel = overrides.embeddingModel;
  }
  if (overrides?.answerModel) {
    result.aiAnswerModel = overrides.answerModel;
  }
  if (overrides?.visionModel) {
    result.aiVisionModel = overrides.visionModel;
  }
  if (overrides?.imageModel) {
    result.aiImageModel = overrides.imageModel;
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
