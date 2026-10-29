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

  it("should strip explicit provider prefix from model", () => {
    const config = resolveAIConfig(
      { AI_API_KEY: "sk-test" },
      { model: "openai:gpt-4o-mini" },
    );
    expect(config.aiModel).toBe("gpt-4o-mini");
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

    it("should fall back to AI_API_KEY when AI_IMAGE_KEY absent", () => {
      const config = resolveAIConfig({ AI_API_KEY: "sk-test" });
      expect(config.aiImageKey).toBe("sk-test");
    });

    it("should allow AI_IMAGE_KEY without AI_API_KEY", () => {
      const config = resolveAIConfig({ AI_IMAGE_KEY: "sk-openai" });
      expect(config.aiApiKey).toBeUndefined();
      expect(config.aiImageKey).toBe("sk-openai");
    });
  });

  describe("provider keys", () => {
    it("uses one OpenAI key for chat, embeddings and images", () => {
      const config = resolveAIConfig(
        { OPENAI_API_KEY: "sk-openai" },
        { model: "gpt-6-luna" },
      );
      expect(config.aiApiKey).toBe("sk-openai");
      expect(config.aiEmbeddingKey).toBe("sk-openai");
      expect(config.aiImageKey).toBe("sk-openai");
    });

    it("picks each capability's key from its model's provider", () => {
      const config = resolveAIConfig(
        {
          OPENAI_API_KEY: "sk-openai",
          ANTHROPIC_API_KEY: "sk-ant",
          GOOGLE_GENERATIVE_AI_API_KEY: "g-key",
        },
        {
          model: "claude-sonnet-5-5",
          imageModel: "gemini-3-pro-image-preview",
        },
      );
      expect(config.aiApiKey).toBe("sk-ant");
      expect(config.aiEmbeddingKey).toBe("sk-openai");
      expect(config.aiImageKey).toBe("g-key");
      expect(config.aiImageModel).toBe("gemini-3-pro-image-preview");
    });

    it("prefers provider keys over legacy keys", () => {
      const config = resolveAIConfig(
        {
          AI_API_KEY: "legacy",
          AI_IMAGE_KEY: "legacy-image",
          OPENAI_API_KEY: "sk-openai",
        },
        { model: "gpt-6-luna" },
      );
      expect(config.aiApiKey).toBe("sk-openai");
      expect(config.aiImageKey).toBe("sk-openai");
    });

    it("fills unset provider keys from AI_API_KEY", () => {
      const config = resolveAIConfig(
        { AI_API_KEY: "legacy", ANTHROPIC_API_KEY: "sk-ant" },
        { model: "claude-sonnet-5-5" },
      );
      expect(config.aiApiKey).toBe("sk-ant");
      expect(config.aiEmbeddingKey).toBe("legacy");
    });
  });

  describe("embeddingModel", () => {
    it("normalizes the openai: prefix", () => {
      const config = resolveAIConfig(
        {},
        { embeddingModel: "openai:text-embedding-3-small" },
      );
      expect(config.aiEmbeddingModel).toBe("text-embedding-3-small");
    });

    it("rejects unsupported embedding models", () => {
      expect(() =>
        resolveAIConfig({}, { embeddingModel: "text-embedding-3-large" }),
      ).toThrow(/Unsupported embeddingModel/);
      expect(() =>
        resolveAIConfig({}, { embeddingModel: "google:gemini-embedding-001" }),
      ).toThrow(/Unsupported embeddingModel/);
    });
  });
});
