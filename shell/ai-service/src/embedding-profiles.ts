import { resolveEmbeddingProvider } from "./provider-selection";

/** What the brain must know about an embedding model to index with it. */
export interface EmbeddingProfile {
  /** Canonical `provider:model` the index and usage are recorded under. */
  model: string;
  provider: string;
  /** The model as its provider names it. */
  modelId: string;
  dimensions: number;
  maxInputTokens: number;
  maxRequestTokens: number;
  maxRequestInputs: number;
  /** Bumped when the text sent for a document or query changes. */
  promptRevision: number;
}

export const DEFAULT_EMBEDDING_MODEL = "openai:text-embedding-3-small";

// OpenAI's embedding limits, shared by its text-embedding-3 models.
const openAiLimits = {
  maxInputTokens: 8_191,
  maxRequestTokens: 300_000,
  maxRequestInputs: 2_048,
};

const profiles: ReadonlyMap<string, EmbeddingProfile> = new Map(
  [
    {
      provider: "openai",
      modelId: "text-embedding-3-small",
      dimensions: 1536,
      ...openAiLimits,
      promptRevision: 0,
    },
    {
      provider: "openai",
      modelId: "text-embedding-3-large",
      dimensions: 3072,
      ...openAiLimits,
      promptRevision: 0,
    },
  ].map((profile) => {
    const model = `${profile.provider}:${profile.modelId}`;
    return [model, { model, ...profile }];
  }),
);

/** The profile of a supported embedding model; absent for any other. */
export function findEmbeddingProfile(
  model: string,
): EmbeddingProfile | undefined {
  const resolved = resolveEmbeddingProvider(model);
  if (!resolved) return undefined;
  return profiles.get(`${resolved.provider}:${resolved.modelId}`);
}

/** The profile of a supported embedding model; throws for any other. */
export function resolveEmbeddingProfile(model: string): EmbeddingProfile {
  const profile = findEmbeddingProfile(model);
  if (!profile) throw new Error(unsupportedEmbeddingModelMessage(model));
  return profile;
}

export function unsupportedEmbeddingModelMessage(model: string): string {
  return `Unsupported embedding model "${model}"; supported: ${[...profiles.keys()].join(", ")}`;
}
