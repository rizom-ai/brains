import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ImageModel, LanguageModel } from "ai";
import type { AIModelConfig } from "./types";
import { resolveTextProvider, selectTextProvider } from "./provider-selection";

export interface ProviderClients {
  anthropicProvider: typeof anthropic;
  openaiProvider: ReturnType<typeof createOpenAI> | null;
  googleProvider: ReturnType<typeof createGoogleGenerativeAI> | null;
}

export function createProviderClients(config: AIModelConfig): ProviderClients {
  const textProvider = config.model
    ? selectTextProvider(config.model)
    : undefined;
  const textApiKey = config.apiKey;
  const imageApiKey = config.imageApiKey ?? config.apiKey;

  return {
    anthropicProvider: textApiKey
      ? createAnthropic({ apiKey: textApiKey })
      : anthropic,
    openaiProvider:
      textProvider === "openai" && textApiKey
        ? createOpenAI({ apiKey: textApiKey })
        : imageApiKey
          ? createOpenAI({ apiKey: imageApiKey })
          : null,
    googleProvider:
      textProvider === "google" && textApiKey
        ? createGoogleGenerativeAI({ apiKey: textApiKey })
        : imageApiKey
          ? createGoogleGenerativeAI({ apiKey: imageApiKey })
          : null,
  };
}

export function getLanguageModel(
  clients: ProviderClients,
  model: string,
): LanguageModel {
  const resolvedModel = resolveTextProvider(model);

  if (resolvedModel.provider === "openai" && clients.openaiProvider) {
    return clients.openaiProvider(resolvedModel.modelId) as LanguageModel;
  }

  if (resolvedModel.provider === "google" && clients.googleProvider) {
    return clients.googleProvider(resolvedModel.modelId) as LanguageModel;
  }

  return clients.anthropicProvider(resolvedModel.modelId);
}

export function canGenerateImages(clients: ProviderClients): boolean {
  return clients.openaiProvider !== null || clients.googleProvider !== null;
}

export function getImageModel(
  clients: ProviderClients,
  provider: string,
  modelId: string,
): ImageModel {
  if (provider === "openai") {
    if (!clients.openaiProvider) {
      throw new Error(
        "Image generation not available: no OpenAI API key configured",
      );
    }
    return clients.openaiProvider.image(modelId);
  }
  if (provider === "google") {
    if (!clients.googleProvider) {
      throw new Error(
        "Image generation not available: no Google API key configured",
      );
    }
    return clients.googleProvider.image(modelId);
  }
  throw new Error(`Image generation not supported for provider: ${provider}`);
}
