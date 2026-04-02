import { describe, it, expect } from "bun:test";
import { parseModelsField } from "../src/multi-model";

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
