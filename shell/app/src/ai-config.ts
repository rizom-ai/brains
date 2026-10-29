/**
 * Resolve AI configuration from environment and brain.yaml overrides.
 *
 * brain.yaml picks a model per capability (`model`, `embeddingModel`,
 * `imageModel`); each model's provider picks its key env var
 * (OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY).
 * The legacy AI_API_KEY / AI_IMAGE_KEY fill in for any unset provider key.
 */

import { resolveCapabilityKeys, resolveEmbeddingModel } from "@brains/core";
import type { ReasoningEffort } from "./types";

/** Fields that resolveAIConfig adds to AppConfig */
export interface AIConfigFields {
  aiApiKey?: string;
  aiImageKey?: string;
  aiEmbeddingKey?: string;
  aiModel?: string;
  aiImageModel?: string;
  aiEmbeddingModel?: string;
  aiReasoningEffort?: ReasoningEffort;
}

export function resolveAIConfig(
  env: Record<string, string | undefined>,
  overrides?: {
    model?: string;
    imageModel?: string;
    embeddingModel?: string;
    reasoningEffort?: ReasoningEffort;
  },
): AIConfigFields {
  const result: AIConfigFields = {};

  if (overrides?.model) {
    // Strip explicit provider prefix ("openai:gpt-4o-mini" → "gpt-4o-mini")
    // Provider is auto-detected by the AI service from the model name.
    const colonIdx = overrides.model.indexOf(":");
    result.aiModel =
      colonIdx > 0 ? overrides.model.slice(colonIdx + 1) : overrides.model;
  }
  if (overrides?.imageModel) {
    result.aiImageModel = overrides.imageModel;
  }
  if (overrides?.embeddingModel) {
    result.aiEmbeddingModel = resolveEmbeddingModel(overrides.embeddingModel);
  }
  if (overrides?.reasoningEffort) {
    result.aiReasoningEffort = overrides.reasoningEffort;
  }

  const keys = resolveCapabilityKeys(env, {
    model: result.aiModel,
    imageModel: result.aiImageModel,
  });
  if (keys.chat.value) {
    result.aiApiKey = keys.chat.value;
  }
  if (keys.images.value) {
    result.aiImageKey = keys.images.value;
  }
  if (keys.embeddings.value) {
    result.aiEmbeddingKey = keys.embeddings.value;
  }

  return result;
}
