import type { EmbeddingDocument } from "@brains/entity-service";
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
  /** The text sent to embed a search query. */
  query(text: string): string;
  /** The text sent to embed a document. */
  document(document: EmbeddingDocument): string;
}

export const DEFAULT_EMBEDDING_MODEL = "openai:text-embedding-3-small";

// OpenAI's embedding limits and prompts, shared by its text-embedding-3
// models: text is sent as it is.
const openAi = {
  provider: "openai",
  maxInputTokens: 8_191,
  maxRequestTokens: 300_000,
  maxRequestInputs: 2_048,
  promptRevision: 0,
  query: (text: string): string => text,
  document: ({ content }: EmbeddingDocument): string => content,
};

const profiles: ReadonlyMap<string, EmbeddingProfile> = new Map(
  [
    { ...openAi, modelId: "text-embedding-3-small", dimensions: 1536 },
    { ...openAi, modelId: "text-embedding-3-large", dimensions: 3072 },
    {
      // EmbeddingGemma 2's text-only variant, served by the model runtime.
      // Its prompts are the model card's retrieval prompts. It reads 8,192
      // tokens, but Ollama serves 2,048 by default and silently truncates
      // longer input, so documents are chunked to fit any runtime.
      provider: "local",
      modelId: "embeddinggemma-2:270m",
      dimensions: 768,
      maxInputTokens: 2_048,
      maxRequestTokens: 32_768,
      maxRequestInputs: 64,
      promptRevision: 1,
      query: (text: string): string => `task: search result | query: ${text}`,
      document: ({ title, content }: EmbeddingDocument): string =>
        `title: ${title ?? "none"} | text: ${content}`,
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
