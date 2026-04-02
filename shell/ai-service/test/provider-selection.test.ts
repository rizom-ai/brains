import { describe, it, expect } from "bun:test";
import { selectTextProvider } from "../src/provider-selection";

describe("selectTextProvider", () => {
  it("should default to anthropic when no provider specified", () => {
    expect(selectTextProvider({})).toBe("anthropic");
  });

  it("should return anthropic when provider is anthropic", () => {
    expect(selectTextProvider({ provider: "anthropic" })).toBe("anthropic");
  });

  it("should return openai when provider is openai", () => {
    expect(selectTextProvider({ provider: "openai" })).toBe("openai");
  });

  it("should return google when provider is google", () => {
    expect(selectTextProvider({ provider: "google" })).toBe("google");
  });

  it("should return the provider string as-is for unknown providers", () => {
    expect(selectTextProvider({ provider: "ollama" })).toBe("ollama");
    expect(selectTextProvider({ provider: "groq" })).toBe("groq");
  });
});
