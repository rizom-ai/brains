import { describe, it, expect } from "bun:test";
import { checkApiKey, checkBunVersion } from "../src/lib/preflight";

describe("checkApiKey", () => {
  it("passes with only the legacy AI_API_KEY", () => {
    const result = checkApiKey({ AI_API_KEY: "sk-proj-test" });
    expect(result.ok).toBe(true);
  });

  it("passes with OPENAI_API_KEY for an OpenAI chat model", () => {
    const result = checkApiKey(
      { OPENAI_API_KEY: "sk-proj-test" },
      { model: "gpt-6-luna" },
    );
    expect(result.ok).toBe(true);
  });

  it("requires both keys for a Claude chat model with OpenAI embeddings", () => {
    const result = checkApiKey(
      { ANTHROPIC_API_KEY: "sk-ant-test" },
      { model: "claude-sonnet-5-5" },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("OPENAI_API_KEY");
    expect(result.message).not.toContain("ANTHROPIC_API_KEY");
  });

  it("does not require the embedding key when embeddings are disabled", () => {
    const result = checkApiKey(
      { ANTHROPIC_API_KEY: "sk-ant-test" },
      { model: "claude-sonnet-5-5", embeddingsEnabled: false },
    );
    expect(result.ok).toBe(true);
  });

  it("does not require an image key", () => {
    const result = checkApiKey(
      { OPENAI_API_KEY: "sk-proj-test" },
      { model: "gpt-6-luna", imageModel: "gemini-3-pro-image-preview" },
    );
    expect(result.ok).toBe(true);
  });

  it("names the missing key once when providers coincide", () => {
    const result = checkApiKey({}, { model: "gpt-6-luna" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("OPENAI_API_KEY is not set");
  });

  it("rejects a legacy Anthropic key standing in for embeddings", () => {
    const result = checkApiKey(
      { AI_API_KEY: "sk-ant-test" },
      { model: "claude-sonnet-5-5" },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain(
      "Embeddings: Expected an API key for OpenAI, but this one is for Anthropic. (from AI_API_KEY)",
    );
  });

  it("allows a legacy Anthropic key when embeddings are disabled", () => {
    const result = checkApiKey(
      { AI_API_KEY: "sk-ant-test" },
      { model: "claude-sonnet-5-5", embeddingsEnabled: false },
    );
    expect(result.ok).toBe(true);
  });

  it("treats a whitespace key as missing", () => {
    const result = checkApiKey({ AI_API_KEY: "  " }, { model: "gpt-6-luna" });
    expect(result.ok).toBe(false);
  });
});

describe("checkBunVersion", () => {
  it("should pass for valid version", () => {
    const result = checkBunVersion("1.3.3");
    expect(result.ok).toBe(true);
  });

  it("should pass for higher version", () => {
    const result = checkBunVersion("1.4.0");
    expect(result.ok).toBe(true);
  });

  it("should fail for lower version", () => {
    const result = checkBunVersion("1.2.0");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("1.3.3");
  });

  it("should pass for major version bump", () => {
    const result = checkBunVersion("2.0.0");
    expect(result.ok).toBe(true);
  });

  it("should fail for old patch", () => {
    const result = checkBunVersion("1.3.2");
    expect(result.ok).toBe(false);
  });
});
