import type { ShellDependencies } from "@brains/core";

type AIService = NonNullable<ShellDependencies["aiService"]>;
type EmbeddingService = NonNullable<ShellDependencies["embeddingService"]>;
type AIConfig = ReturnType<AIService["getConfig"]>;
type LanguageModel = ReturnType<AIService["getModel"]>;

/** The model a test brain names. It reaches no provider. */
export const TEST_BRAIN_MODEL = "none";

const NO_PROVIDER = "A test brain has no AI provider";

function refuse(): Promise<never> {
  return Promise.reject(new Error(NO_PROVIDER));
}

/** A model the agent can be built with, which refuses every call it is given. */
function refusingModel(modelId: string): LanguageModel {
  return {
    specificationVersion: "v3",
    provider: "test-brain",
    modelId,
    supportedUrls: {},
    doGenerate: refuse,
    doStream: refuse,
  };
}

/**
 * A test brain's AI: every call is refused at once, so a package under test
 * never reaches a provider, or a network, by accident. It is configured as
 * the runtime configures its own AI, and keeps that configuration as it does.
 */
export function createNoAIService(initial: AIConfig): AIService {
  let config: AIConfig = { ...initial };
  return {
    generateText: refuse,
    generateObject: refuse,
    judge: refuse,
    generateImage: refuse,
    getModel: () => refusingModel(config.model ?? TEST_BRAIN_MODEL),
    canGenerateImages: () => false,
    getConfig: () => ({ ...config }),
    updateConfig: (update): void => {
      config = { ...config, ...update };
    },
  };
}

/** A test brain's embeddings, which it never computes: it searches without them. */
export function createNoEmbeddingService(): EmbeddingService {
  return {
    // It computes no vectors, so its identity matches no stored index.
    identity: { model: "test:none", dimensions: 1536, promptRevision: 0 },
    embedQuery: refuse,
    embedDocuments: refuse,
  };
}
