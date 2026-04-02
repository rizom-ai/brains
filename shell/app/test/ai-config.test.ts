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

  it("should resolve model and provider when model specified", () => {
    const config = resolveAIConfig(
      { AI_API_KEY: "sk-test" },
      { model: "gpt-4o-mini" },
    );
    expect(config.aiModel).toBe("gpt-4o-mini");
    expect(config.aiProvider).toBe("openai");
    expect(config.aiApiKey).toBe("sk-test");
  });

  it("should auto-detect anthropic from claude model", () => {
    const config = resolveAIConfig(
      { AI_API_KEY: "sk-test" },
      { model: "claude-haiku-4-5-20251001" },
    );
    expect(config.aiProvider).toBe("anthropic");
    expect(config.aiModel).toBe("claude-haiku-4-5-20251001");
  });

  it("should auto-detect google from gemini model", () => {
    const config = resolveAIConfig(
      { AI_API_KEY: "sk-test" },
      { model: "gemini-2.0-flash" },
    );
    expect(config.aiProvider).toBe("google");
  });

  it("should handle explicit provider prefix", () => {
    const config = resolveAIConfig(
      { AI_API_KEY: "sk-test" },
      { model: "openai:gpt-4o-mini" },
    );
    expect(config.aiProvider).toBe("openai");
    expect(config.aiModel).toBe("gpt-4o-mini");
  });

  it("should not set provider when no model specified", () => {
    const config = resolveAIConfig({ AI_API_KEY: "sk-test" });
    expect(config.aiProvider).toBeUndefined();
    expect(config.aiModel).toBeUndefined();
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
