/**
 * Resolve AI configuration from environment and brain.yaml overrides.
 *
 * Two env vars:
 *   AI_API_KEY   — primary key for text generation (and images if no override)
 *   AI_IMAGE_KEY — optional override for image generation (different provider)
 *
 * The model field determines the provider (resolved by AI service at runtime).
 */

/** Fields that resolveAIConfig adds to AppConfig */
export interface AIConfigFields {
  aiApiKey?: string;
  aiImageKey?: string;
  aiModel?: string;
}

export function resolveAIConfig(
  env: Record<string, string | undefined>,
  overrides?: { model?: string },
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

  if (overrides?.model) {
    // Strip explicit provider prefix ("openai:gpt-4o-mini" → "gpt-4o-mini")
    // Provider is auto-detected by the AI service from the model name.
    const colonIdx = overrides.model.indexOf(":");
    result.aiModel =
      colonIdx > 0 ? overrides.model.slice(colonIdx + 1) : overrides.model;
  }

  return result;
}
