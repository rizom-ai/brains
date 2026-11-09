import type { AIModelConfig, ReasoningEffort } from "./types";

const DEFAULT_TEMPERATURE = 0.7;

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface SDKUsage {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
}

interface TextGenerationOptions {
  temperature?: number;
  providerOptions?: { openai: ReturnType<typeof openAIReasoningOptions> };
}

/**
 * The SDK applies reasoning only to model names on its own allowlist. A model
 * this runtime treats as reasoning (no temperature) keeps its configured
 * effort even when the SDK does not recognize the name.
 */
export function openAIReasoningOptions(
  reasoningEffort: ReasoningEffort,
  supportsTemperature: boolean,
): { reasoningEffort: ReasoningEffort; forceReasoning: boolean } {
  return { reasoningEffort, forceReasoning: !supportsTemperature };
}

export function withAIModelDefaults(config: AIModelConfig): AIModelConfig {
  return {
    ...config,
    temperature: config.temperature ?? DEFAULT_TEMPERATURE,
    webSearch: config.webSearch ?? true,
  };
}

export function getTextGenerationOptions(
  config: AIModelConfig,
  provider: string,
  supportsTemp: boolean,
): TextGenerationOptions {
  const options: TextGenerationOptions = {};

  if (config.temperature !== undefined && supportsTemp) {
    options.temperature = config.temperature;
  }

  if (provider === "openai" && config.reasoningEffort) {
    options.providerOptions = {
      openai: openAIReasoningOptions(config.reasoningEffort, supportsTemp),
    };
  }

  return options;
}

export function toTokenUsage(usage: SDKUsage): TokenUsage {
  return {
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  };
}
