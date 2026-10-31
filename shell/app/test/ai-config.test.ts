import { describe, it, expect } from "bun:test";
import { resolveAIConfig } from "../src/ai-config";

describe("resolveAIConfig", () => {
  it("should use AI_API_KEY as the single key", () => {
    const config = resolveAIConfig({ AI_API_KEY: "sk-test" });
    expect(config.aiApiKey).toBe("sk-test");
  });

  it("should return no key when AI_API_KEY not set", () => {
    const config = resolveAIConfig({});
    expect(config.aiApiKey).toBeUndefined();
  });

  it("should pass model through when specified", () => {
    const config = resolveAIConfig(
      { AI_API_KEY: "sk-test" },
      { model: "gpt-4o-mini" },
    );
    expect(config.aiModel).toBe("gpt-4o-mini");
    expect(config.aiApiKey).toBe("sk-test");
  });

  it("keeps an explicit provider prefix on the model", () => {
    const config = resolveAIConfig(
      { AI_API_KEY: "sk-test" },
      { model: "openai:gpt-4o-mini" },
    );
    expect(config.aiModel).toBe("openai:gpt-4o-mini");
  });

  it("passes the embedding model through with its provider prefix", () => {
    const config = resolveAIConfig(
      { AI_API_KEY: "sk-test" },
      { embeddingModel: "openai:text-embedding-3-large" },
    );
    expect(config.aiEmbeddingModel).toBe("openai:text-embedding-3-large");
  });

  it("takes the model runtime the deploy runs alongside the brain", () => {
    expect(
      resolveAIConfig({ MODEL_RUNTIME_URL: "http://rover-models:11434" })
        .aiModelRuntimeUrl,
    ).toBe("http://rover-models:11434");
  });

  it("prefers the model runtime brain.yaml names", () => {
    expect(
      resolveAIConfig(
        { MODEL_RUNTIME_URL: "http://rover-models:11434" },
        { modelRuntimeUrl: "http://localhost:11434" },
      ).aiModelRuntimeUrl,
    ).toBe("http://localhost:11434");
  });

  it("does not set an embedding model when none is configured", () => {
    expect(
      resolveAIConfig({ AI_API_KEY: "sk-test" }).aiEmbeddingModel,
    ).toBeUndefined();
  });

  it("should not set model when no model specified", () => {
    const config = resolveAIConfig({ AI_API_KEY: "sk-test" });
    expect(config.aiModel).toBeUndefined();
  });

  it("should pass through configured reasoning effort", () => {
    const config = resolveAIConfig(
      { AI_API_KEY: "sk-test" },
      { model: "gpt-5.6-luna", reasoningEffort: "low" },
    );

    expect(config.aiModel).toBe("gpt-5.6-luna");
    expect(config.aiReasoningEffort).toBe("low");
  });

  describe("AI_IMAGE_KEY", () => {
    it("should use AI_IMAGE_KEY as separate image key", () => {
      const config = resolveAIConfig({
        AI_API_KEY: "sk-anthropic",
        AI_IMAGE_KEY: "sk-openai",
      });
      expect(config.aiApiKey).toBe("sk-anthropic");
      expect(config.aiImageKey).toBe("sk-openai");
    });

    it("should not set aiImageKey when AI_IMAGE_KEY absent", () => {
      const config = resolveAIConfig({ AI_API_KEY: "sk-test" });
      expect(config.aiImageKey).toBeUndefined();
    });

    it("should allow AI_IMAGE_KEY without AI_API_KEY", () => {
      const config = resolveAIConfig({ AI_IMAGE_KEY: "sk-openai" });
      expect(config.aiApiKey).toBeUndefined();
      expect(config.aiImageKey).toBe("sk-openai");
    });
  });
});
