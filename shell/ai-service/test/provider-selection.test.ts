import { describe, it, expect } from "bun:test";
import {
  isSupportedTextModel,
  resolveTextProvider,
  selectTextProvider,
  selectImageProvider,
  supportsTemperature,
} from "../src/provider-selection";

describe("selectTextProvider", () => {
  it("should default to anthropic when no model specified", () => {
    expect(selectTextProvider()).toBe("anthropic");
  });

  it("should detect anthropic from claude model", () => {
    expect(selectTextProvider("claude-haiku-4-5-20251001")).toBe("anthropic");
    expect(selectTextProvider("claude-sonnet-4-6")).toBe("anthropic");
  });

  it("should detect openai from gpt model", () => {
    expect(selectTextProvider("gpt-4o-mini")).toBe("openai");
    expect(selectTextProvider("gpt-4o")).toBe("openai");
  });

  it("should detect openai from o-series model", () => {
    expect(selectTextProvider("o1-preview")).toBe("openai");
    expect(selectTextProvider("o3-mini")).toBe("openai");
  });

  it("should detect google from gemini model", () => {
    expect(selectTextProvider("gemini-2.0-flash")).toBe("google");
  });

  it("should detect the local runtime from open model names", () => {
    expect(selectTextProvider("llama-3.1-8b")).toBe("local");
    expect(selectTextProvider("mistral-7b")).toBe("local");
    expect(selectTextProvider("phi-3")).toBe("local");
    expect(selectTextProvider("qwen-2.5")).toBe("local");
  });

  it("should handle explicit provider prefix", () => {
    expect(selectTextProvider("openai:gpt-4o-mini")).toBe("openai");
    expect(selectTextProvider("anthropic:claude-haiku-4-5")).toBe("anthropic");
    expect(selectTextProvider("groq:llama-3.1-70b")).toBe("groq");
  });

  it("should fall back to anthropic for unknown model", () => {
    expect(selectTextProvider("some-unknown-model")).toBe("anthropic");
  });
});

describe("isSupportedTextModel", () => {
  it("accepts models of providers the brain has a client for", () => {
    expect(isSupportedTextModel("claude-haiku-4-5")).toBe(true);
    expect(isSupportedTextModel("openai:gpt-6-luna")).toBe(true);
    expect(isSupportedTextModel("google:gemini-2.0-flash")).toBe(true);
  });

  it("accepts models of the local runtime", () => {
    expect(isSupportedTextModel("local:qwen3:4b")).toBe(true);
    expect(isSupportedTextModel("qwen3:4b")).toBe(true);
  });

  it("rejects an unknown provider instead of falling back to anthropic", () => {
    expect(isSupportedTextModel("groq:llama-3.1-70b")).toBe(false);
  });
});

describe("resolveTextProvider", () => {
  it("keeps a runtime tag's colon in the model id", () => {
    expect(resolveTextProvider("local:qwen3:4b")).toEqual({
      provider: "local",
      modelId: "qwen3:4b",
    });
    expect(resolveTextProvider("qwen3:4b")).toEqual({
      provider: "local",
      modelId: "qwen3:4b",
    });
  });

  it("should return provider and SDK model ID for explicit prefixes", () => {
    expect(resolveTextProvider("openai:gpt-4o-mini")).toEqual({
      provider: "openai",
      modelId: "gpt-4o-mini",
    });
  });

  it("should return original model ID for auto-detected models", () => {
    expect(resolveTextProvider("claude-haiku-4-5")).toEqual({
      provider: "anthropic",
      modelId: "claude-haiku-4-5",
    });
  });
});

describe("supportsTemperature", () => {
  it("should allow temperature for non-reasoning models", () => {
    expect(supportsTemperature("claude-haiku-4-5")).toBe(true);
    expect(supportsTemperature("gpt-4o-mini")).toBe(true);
    expect(supportsTemperature("openai:gpt-4o-mini")).toBe(true);
  });

  it("should disable temperature for OpenAI reasoning models", () => {
    expect(supportsTemperature("gpt-5.4-mini")).toBe(false);
    expect(supportsTemperature("openai:gpt-5.4-mini")).toBe(false);
    expect(supportsTemperature("gpt-6-luna")).toBe(false);
    expect(supportsTemperature("openai:gpt-6-luna")).toBe(false);
    expect(supportsTemperature("o3-mini")).toBe(false);
  });
});

describe("selectImageProvider", () => {
  it("should default to openai when no model specified", () => {
    expect(selectImageProvider()).toEqual({
      provider: "openai",
      modelId: "gpt-image-1.5",
    });
  });

  it("should detect openai from gpt-image model", () => {
    expect(selectImageProvider("gpt-image-1.5")).toEqual({
      provider: "openai",
      modelId: "gpt-image-1.5",
    });
  });

  it("should detect google from gemini image model", () => {
    expect(selectImageProvider("gemini-3-pro-image-preview")).toEqual({
      provider: "google",
      modelId: "gemini-3-pro-image-preview",
    });
    expect(selectImageProvider("gemini-2.5-flash-image")).toEqual({
      provider: "google",
      modelId: "gemini-2.5-flash-image",
    });
  });

  it("should handle explicit provider prefix", () => {
    expect(selectImageProvider("openai:gpt-image-1.5")).toEqual({
      provider: "openai",
      modelId: "gpt-image-1.5",
    });
    expect(selectImageProvider("google:gemini-3-pro-image-preview")).toEqual({
      provider: "google",
      modelId: "gemini-3-pro-image-preview",
    });
  });

  it("should detect google from any gemini model", () => {
    expect(selectImageProvider("gemini-2.0-flash")).toEqual({
      provider: "google",
      modelId: "gemini-2.0-flash",
    });
  });

  it("should fall back to openai for unknown model", () => {
    expect(selectImageProvider("some-unknown-model")).toEqual({
      provider: "openai",
      modelId: "some-unknown-model",
    });
  });
});
