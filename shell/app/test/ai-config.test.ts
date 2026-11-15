import { describe, it, expect } from "bun:test";
import { resolveAIConfig } from "../src/ai-config";

describe("resolveAIConfig", () => {
  it("reads each provider's key from its own variable", () => {
    const config = resolveAIConfig({
      OPENAI_API_KEY: "sk-proj-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
      GOOGLE_GENERATIVE_AI_API_KEY: "AIzatest",
    });
    expect(config.aiProviderKeys).toEqual({
      openai: "sk-proj-test",
      anthropic: "sk-ant-test",
      google: "AIzatest",
    });
  });

  it("sets no keys when no provider variable is set", () => {
    expect(resolveAIConfig({}).aiProviderKeys).toBeUndefined();
  });

  it("ignores the single legacy keys", () => {
    const config = resolveAIConfig({
      AI_API_KEY: "sk-proj-test",
      AI_IMAGE_KEY: "AIzatest",
    });
    expect(config.aiProviderKeys).toBeUndefined();
  });

  it("should pass model through when specified", () => {
    const config = resolveAIConfig(
      { OPENAI_API_KEY: "sk-test" },
      { model: "gpt-4o-mini" },
    );
    expect(config.aiModel).toBe("gpt-4o-mini");
    expect(config.aiProviderKeys).toEqual({ openai: "sk-test" });
  });

  it("keeps an explicit provider prefix on the model", () => {
    const config = resolveAIConfig(
      { OPENAI_API_KEY: "sk-test" },
      { model: "openai:gpt-4o-mini" },
    );
    expect(config.aiModel).toBe("openai:gpt-4o-mini");
  });

  it("passes the embedding model through with its provider prefix", () => {
    const config = resolveAIConfig(
      { OPENAI_API_KEY: "sk-test" },
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

  it("passes the answer model through", () => {
    expect(
      resolveAIConfig({}, { answerModel: "local:qwen3:30b-a3b-instruct" })
        .aiAnswerModel,
    ).toBe("local:qwen3:30b-a3b-instruct");
  });

  it("passes the vision model through", () => {
    expect(
      resolveAIConfig({}, { visionModel: "local:qwen3-vl:8b" }).aiVisionModel,
    ).toBe("local:qwen3-vl:8b");
  });

  it("passes the image model through", () => {
    expect(
      resolveAIConfig({}, { imageModel: "local:z-image-turbo" }).aiImageModel,
    ).toBe("local:z-image-turbo");
  });

  it("does not set an embedding model when none is configured", () => {
    expect(
      resolveAIConfig({ OPENAI_API_KEY: "sk-test" }).aiEmbeddingModel,
    ).toBeUndefined();
  });

  it("should not set model when no model specified", () => {
    const config = resolveAIConfig({ OPENAI_API_KEY: "sk-test" });
    expect(config.aiModel).toBeUndefined();
  });

  it("should pass through configured reasoning effort", () => {
    const config = resolveAIConfig(
      { OPENAI_API_KEY: "sk-test" },
      { model: "gpt-5.6-luna", reasoningEffort: "low" },
    );

    expect(config.aiModel).toBe("gpt-5.6-luna");
    expect(config.aiReasoningEffort).toBe("low");
  });
});
