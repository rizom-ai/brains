import type { AIModelConfig, ReasoningEffort } from "./types";

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
  providerOptions?: ReasoningProviderOptions;
}

/** Provider options carrying a configured reasoning effort. */
export type ReasoningProviderOptions =
  | { openai: ReturnType<typeof openAIReasoningOptions> }
  | { local: { reasoningEffort: ReasoningEffort } };

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

/**
 * The reasoning effort a provider is asked for: OpenAI's own options, or the
 * model runtime's `reasoning_effort` (`none` turns a local model's thinking
 * off). Other providers ignore it.
 */
export function reasoningProviderOptions(
  provider: string,
  reasoningEffort: ReasoningEffort | undefined,
  supportsTemperature: boolean,
): ReasoningProviderOptions | undefined {
  if (!reasoningEffort) return undefined;
  if (provider === "openai")
    return {
      openai: openAIReasoningOptions(reasoningEffort, supportsTemperature),
    };
  if (provider === "local") return { local: { reasoningEffort } };
  return undefined;
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
  provider: string,
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

  const reasoning = reasoningProviderOptions(
    provider,
    config.reasoningEffort,
    supportsTemp,
  );
  if (reasoning) options.providerOptions = reasoning;

  return options;
}

export function toTokenUsage(usage: SDKUsage): TokenUsage {
  return {
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  };
}
