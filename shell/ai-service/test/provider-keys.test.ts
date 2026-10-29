import { describe, expect, it } from "bun:test";
import {
  providerKeyError,
  resolveCapabilityKeys,
  resolveEmbeddingModel,
} from "../src/provider-keys";

const OPENAI_PROJECT_KEY = "sk-proj-abc_DEF-123";
const OPENAI_LEGACY_KEY = `sk-${"a".repeat(48)}`;
const ANTHROPIC_KEY = "sk-ant-api03-abc";
const GOOGLE_KEY = `AIza${"b".repeat(35)}`;

describe("providerKeyError", () => {
  it("accepts OpenAI project, service-account, admin and legacy keys", () => {
    for (const key of [
      OPENAI_PROJECT_KEY,
      "sk-svcacct-abc",
      "sk-admin-abc",
      OPENAI_LEGACY_KEY,
    ]) {
      expect(providerKeyError("openai", key)).toBeUndefined();
    }
  });

  it("accepts Anthropic and Google keys", () => {
    expect(providerKeyError("anthropic", ANTHROPIC_KEY)).toBeUndefined();
    expect(providerKeyError("google", GOOGLE_KEY)).toBeUndefined();
  });

  it("names the provider a key in another provider's format is for", () => {
    expect(providerKeyError("openai", ANTHROPIC_KEY)).toBe(
      "Expected an API key for OpenAI, but this one is for Anthropic.",
    );
    expect(providerKeyError("anthropic", GOOGLE_KEY)).toBe(
      "Expected an API key for Anthropic, but this one is for Google.",
    );
  });

  it("refuses anything not in the provider's formats", () => {
    for (const key of ["sk-or-v1-abc", "sk-test", "test-key"]) {
      expect(providerKeyError("openai", key)).toBe(
        "Expected an API key for OpenAI, but this is not one.",
      );
    }
  });
});

describe("resolveEmbeddingModel", () => {
  it("accepts the default model, with or without its provider prefix", () => {
    expect(resolveEmbeddingModel()).toBe("text-embedding-3-small");
    expect(resolveEmbeddingModel("openai:text-embedding-3-small")).toBe(
      "text-embedding-3-small",
    );
  });

  it("refuses any other model or provider", () => {
    expect(() => resolveEmbeddingModel("text-embedding-3-large")).toThrow(
      "Unsupported embeddingModel",
    );
    expect(() =>
      resolveEmbeddingModel("google:text-embedding-3-small"),
    ).toThrow("Unsupported embeddingModel");
  });
});

describe("resolveCapabilityKeys", () => {
  it("falls back to the legacy key for every capability", () => {
    const keys = resolveCapabilityKeys(
      { AI_API_KEY: ANTHROPIC_KEY },
      { model: "claude-sonnet-5-5" },
    );
    expect(keys.chat).toMatchObject({
      provider: "anthropic",
      envVar: "ANTHROPIC_API_KEY",
      source: "AI_API_KEY",
    });
    expect(keys.embeddings).toMatchObject({
      provider: "openai",
      value: ANTHROPIC_KEY,
      source: "AI_API_KEY",
    });
  });

  it("uses each provider's own key over the legacy key", () => {
    const keys = resolveCapabilityKeys(
      { AI_API_KEY: ANTHROPIC_KEY, OPENAI_API_KEY: OPENAI_PROJECT_KEY },
      { model: "claude-sonnet-5-5" },
    );
    expect(keys.embeddings).toMatchObject({
      value: OPENAI_PROJECT_KEY,
      source: "OPENAI_API_KEY",
    });
  });

  it("prefers the legacy image key over the legacy key for images", () => {
    const keys = resolveCapabilityKeys(
      { AI_API_KEY: OPENAI_PROJECT_KEY, AI_IMAGE_KEY: GOOGLE_KEY },
      { imageModel: "gemini-3-pro-image-preview" },
    );
    expect(keys.images).toMatchObject({
      provider: "google",
      value: GOOGLE_KEY,
      source: "AI_IMAGE_KEY",
    });
  });

  it("leaves a provider without a key, such as Ollama, without an env var", () => {
    const keys = resolveCapabilityKeys({}, { model: "llama3.2" });
    expect(keys.chat).toMatchObject({
      provider: "ollama",
      envVar: undefined,
      value: undefined,
    });
  });
});
