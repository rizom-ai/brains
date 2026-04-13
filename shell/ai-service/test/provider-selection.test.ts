import { describe, it, expect } from "bun:test";
import {
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

  it("should detect ollama from local model names", () => {
    expect(selectTextProvider("llama-3.1-8b")).toBe("ollama");
    expect(selectTextProvider("mistral-7b")).toBe("ollama");
    expect(selectTextProvider("phi-3")).toBe("ollama");
    expect(selectTextProvider("qwen-2.5")).toBe("ollama");
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

describe("supportsTemperature", () => {
  it("should allow temperature for non-reasoning models", () => {
    expect(supportsTemperature("claude-haiku-4-5")).toBe(true);
    expect(supportsTemperature("gpt-4o-mini")).toBe(true);
    expect(supportsTemperature("openai:gpt-4o-mini")).toBe(true);
  });

  it("should disable temperature for OpenAI reasoning models", () => {
    expect(supportsTemperature("gpt-5.4-mini")).toBe(false);
    expect(supportsTemperature("openai:gpt-5.4-mini")).toBe(false);
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
