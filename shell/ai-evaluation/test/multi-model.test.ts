import { describe, it, expect } from "bun:test";
import {
  parseModelsField,
  parseJudgeField,
  parseSamplesField,
  resolveProviderKey,
  resolveSampling,
} from "../src/multi-model";

describe("resolveSampling", () => {
  it("defaults to one sample that must pass", () => {
    expect(resolveSampling({ multiModel: true })).toEqual({
      samples: 1,
      minPassRate: 1,
    });
  });

  it("prefers the CLI over brain.eval.yaml", () => {
    expect(
      resolveSampling({ multiModel: true, cliSamples: 3, yamlSamples: 5 }),
    ).toEqual({ samples: 3, minPassRate: 1 });
    expect(
      resolveSampling({ multiModel: true, yamlSamples: 5, minPassRate: 0.8 }),
    ).toEqual({ samples: 5, minPassRate: 0.8 });
  });

  it("refuses sampling without a models list, which has no fresh environment per sample", () => {
    expect(() => resolveSampling({ multiModel: false, cliSamples: 3 })).toThrow(
      "models:",
    );
    expect(() =>
      resolveSampling({ multiModel: false, minPassRate: 0.8 }),
    ).toThrow("models:");
    expect(resolveSampling({ multiModel: false })).toEqual({
      samples: 1,
      minPassRate: 1,
    });
  });
});

describe("parseSamplesField", () => {
  it("is absent when not configured", () => {
    expect(parseSamplesField({})).toBeUndefined();
  });

  it("reads a positive integer sample count", () => {
    expect(parseSamplesField({ samples: 5 })).toBe(5);
  });

  it.each([0, -1, 1.5, "5"])("rejects %p", (samples) => {
    expect(() => parseSamplesField({ samples })).toThrow();
  });
});

describe("parseModelsField", () => {
  it("should return empty array when no models field", () => {
    const result = parseModelsField({});
    expect(result).toEqual([]);
  });

  it("should parse array of model strings", () => {
    const result = parseModelsField({
      models: ["gpt-4o-mini", "claude-haiku-4-5"],
    });
    expect(result).toEqual(["gpt-4o-mini", "claude-haiku-4-5"]);
  });

  it("should return empty array for non-array models field", () => {
    const result = parseModelsField({ models: "gpt-4o-mini" });
    expect(result).toEqual([]);
  });

  it("should filter out non-string entries", () => {
    const result = parseModelsField({ models: ["gpt-4o-mini", 42, null] });
    expect(result).toEqual(["gpt-4o-mini"]);
  });

  it("should handle explicit provider prefix", () => {
    const result = parseModelsField({
      models: ["openai:gpt-4o-mini", "anthropic:claude-haiku-4-5"],
    });
    expect(result).toEqual([
      "openai:gpt-4o-mini",
      "anthropic:claude-haiku-4-5",
    ]);
  });
});

describe("parseJudgeField", () => {
  it("should return undefined when no judge field", () => {
    expect(parseJudgeField({})).toBeUndefined();
  });

  it("should return model string", () => {
    expect(parseJudgeField({ judge: "claude-haiku-4-5" })).toBe(
      "claude-haiku-4-5",
    );
  });

  it("should return undefined for non-string", () => {
    expect(parseJudgeField({ judge: 42 })).toBeUndefined();
  });
});

describe("resolveProviderKey", () => {
  it("should return OPENAI_API_KEY for gpt models", () => {
    const env = { OPENAI_API_KEY: "sk-openai", ANTHROPIC_API_KEY: "sk-ant" };
    expect(resolveProviderKey("gpt-4o-mini", env)).toBe("sk-openai");
  });

  it("should return ANTHROPIC_API_KEY for claude models", () => {
    const env = { OPENAI_API_KEY: "sk-openai", ANTHROPIC_API_KEY: "sk-ant" };
    expect(resolveProviderKey("claude-haiku-4-5", env)).toBe("sk-ant");
  });

  it("should return GOOGLE_GENERATIVE_AI_API_KEY for gemini models", () => {
    const env = { GOOGLE_GENERATIVE_AI_API_KEY: "goog-key" };
    expect(resolveProviderKey("gemini-2.0-flash", env)).toBe("goog-key");
  });

  it("should handle explicit provider prefix", () => {
    const env = { OPENAI_API_KEY: "sk-openai" };
    expect(resolveProviderKey("openai:gpt-4o-mini", env)).toBe("sk-openai");
  });

  it("should fall back to AI_API_KEY when provider key missing", () => {
    const env = { AI_API_KEY: "sk-default" };
    expect(resolveProviderKey("gpt-4o-mini", env)).toBe("sk-default");
  });

  it("should return undefined when no matching key", () => {
    expect(resolveProviderKey("gpt-4o-mini", {})).toBeUndefined();
  });

  it("should return undefined for ollama (no key needed)", () => {
    const env = { OPENAI_API_KEY: "sk-openai" };
    expect(resolveProviderKey("llama-3.1", env)).toBeUndefined();
  });
});
