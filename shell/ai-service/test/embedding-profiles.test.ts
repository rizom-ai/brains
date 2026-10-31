import { describe, expect, it } from "bun:test";
import {
  DEFAULT_EMBEDDING_MODEL,
  findEmbeddingProfile,
  resolveEmbeddingProfile,
} from "../src/embedding-profiles";

describe("embedding profiles", () => {
  it("resolves an explicit provider:model to its profile", () => {
    expect(
      resolveEmbeddingProfile("openai:text-embedding-3-large"),
    ).toMatchObject({
      model: "openai:text-embedding-3-large",
      provider: "openai",
      modelId: "text-embedding-3-large",
      dimensions: 3072,
      maxInputTokens: 8_191,
      maxRequestTokens: 300_000,
      maxRequestInputs: 2_048,
      promptRevision: 0,
    });
  });

  it("defaults to OpenAI text-embedding-3-small at 1536 dimensions", () => {
    const profile = resolveEmbeddingProfile(DEFAULT_EMBEDDING_MODEL);
    expect(profile.model).toBe("openai:text-embedding-3-small");
    expect(profile.dimensions).toBe(1536);
  });

  it("resolves a bare OpenAI embedding model name to its provider", () => {
    expect(resolveEmbeddingProfile("text-embedding-3-small").model).toBe(
      "openai:text-embedding-3-small",
    );
  });

  it("rejects an unknown provider", () => {
    expect(findEmbeddingProfile("acme:text-embedding-3-small")).toBeUndefined();
    expect(() =>
      resolveEmbeddingProfile("acme:text-embedding-3-small"),
    ).toThrow('Unsupported embedding model "acme:text-embedding-3-small"');
  });

  it("rejects an embedding model without a profile", () => {
    expect(
      findEmbeddingProfile("openai:text-embedding-ada-002"),
    ).toBeUndefined();
  });
});

describe("EmbeddingGemma 2", () => {
  const gemma = resolveEmbeddingProfile("local:embeddinggemma-2:270m");

  it("is served by the local runtime at 768 dimensions", () => {
    expect(gemma).toMatchObject({
      model: "local:embeddinggemma-2:270m",
      provider: "local",
      modelId: "embeddinggemma-2:270m",
      dimensions: 768,
      // Ollama's default context; longer input is truncated silently.
      maxInputTokens: 2_048,
      promptRevision: 1,
    });
  });

  it("resolves its bare name to the local runtime", () => {
    expect(findEmbeddingProfile("embeddinggemma-2:270m")).toBe(gemma);
  });

  it("frames queries as search queries", () => {
    expect(gemma.query("green software")).toBe(
      "task: search result | query: green software",
    );
  });

  it("frames documents with their title, or none", () => {
    expect(gemma.document({ title: "Principles", content: "Body" })).toBe(
      "title: Principles | text: Body",
    );
    expect(gemma.document({ content: "Body" })).toBe(
      "title: none | text: Body",
    );
  });
});

describe("OpenAI embedding prompts", () => {
  const small = resolveEmbeddingProfile(DEFAULT_EMBEDDING_MODEL);

  it("sends queries and documents unchanged", () => {
    expect(small.query("green software")).toBe("green software");
    expect(small.document({ title: "Principles", content: "Body" })).toBe(
      "Body",
    );
  });
});
