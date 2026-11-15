import { describe, it, expect } from "bun:test";
import { checkBunVersion, checkModelKeys } from "../src/lib/preflight";

describe("checkModelKeys", () => {
  it("passes when each model's provider has its key", () => {
    const result = checkModelKeys(
      { OPENAI_API_KEY: "sk-proj-test" },
      { model: "gpt-6-luna" },
    );
    expect(result).toEqual({ ok: true, warnings: [] });
  });

  it("names each missing provider variable", () => {
    const result = checkModelKeys(
      { ANTHROPIC_API_KEY: "sk-ant-test" },
      { model: "claude-sonnet-5" },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain(
      "openai:text-embedding-3-small needs OPENAI_API_KEY",
    );
    expect(result.message).toContain("OPENAI_API_KEY=your-api-key-here");
    expect(result.message).not.toContain("ANTHROPIC_API_KEY=");
  });

  it("ignores the single legacy key", () => {
    const result = checkModelKeys(
      { AI_API_KEY: "sk-proj-test" },
      { model: "gpt-6-luna" },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("gpt-6-luna needs OPENAI_API_KEY");
  });

  it("needs no embedding key when embeddings are disabled", () => {
    const result = checkModelKeys(
      { ANTHROPIC_API_KEY: "sk-ant-test" },
      { model: "claude-sonnet-5", embeddingEnabled: false },
    );
    expect(result.ok).toBe(true);
  });

  it("needs no key when every model runs on the model runtime", () => {
    const result = checkModelKeys(
      {},
      {
        model: "local:qwen3:8b",
        embeddingModel: "local:embeddinggemma-2:270m",
        modelRuntimeUrl: "http://models:11434",
      },
    );
    expect(result.ok).toBe(true);
  });

  it("never blocks boot on the image model", () => {
    const result = checkModelKeys(
      { OPENAI_API_KEY: "sk-proj-test" },
      { model: "gpt-6-luna", imageModel: "gemini-3-pro-image-preview" },
    );
    expect(result).toEqual({
      ok: true,
      warnings: [
        "Image generation is off: gemini-3-pro-image-preview needs GOOGLE_GENERATIVE_AI_API_KEY",
      ],
    });
  });

  it("warns when a key looks like another provider's", () => {
    const result = checkModelKeys(
      { OPENAI_API_KEY: "sk-ant-api03-test" },
      { model: "gpt-6-luna" },
    );
    expect(result).toEqual({
      ok: true,
      warnings: ["OPENAI_API_KEY looks like an Anthropic key."],
    });
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
