import type { AIModelConfig } from "./types";

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 1000;

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
  maxTokens?: number;
  webSearch?: true;
}

export function withAIModelDefaults(config: AIModelConfig): AIModelConfig {
  return {
    ...config,
    temperature: config.temperature ?? DEFAULT_TEMPERATURE,
    maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    webSearch: config.webSearch ?? true,
  };
}

export function getTextGenerationOptions(
  config: AIModelConfig,
  supportsTemp: boolean,
): TextGenerationOptions {
  const options: TextGenerationOptions = {};

  if (config.temperature !== undefined && supportsTemp) {
    options.temperature = config.temperature;
  }

  if (config.maxTokens !== undefined) {
    options.maxTokens = config.maxTokens;
  }

  if (config.webSearch) {
    options.webSearch = true;
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
