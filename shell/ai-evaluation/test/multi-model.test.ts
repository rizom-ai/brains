import { describe, it, expect } from "bun:test";
import {
  parseModelsField,
  parseKeysField,
  resolveApiKey,
} from "../src/multi-model";

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

describe("parseKeysField", () => {
  it("should return empty map when no keys field", () => {
    expect(parseKeysField({})).toEqual({});
  });

  it("should parse provider-to-key map", () => {
    const result = parseKeysField({
      keys: {
        openai: "sk-openai-123",
        anthropic: "sk-ant-456",
      },
    });
    expect(result).toEqual({
      openai: "sk-openai-123",
      anthropic: "sk-ant-456",
    });
  });

  it("should filter out non-string values", () => {
    const result = parseKeysField({
      keys: {
        openai: "sk-openai-123",
        broken: 42,
        empty: null,
      },
    });
    expect(result).toEqual({ openai: "sk-openai-123" });
  });

  it("should return empty map for non-object keys field", () => {
    expect(parseKeysField({ keys: "not-a-map" })).toEqual({});
    expect(parseKeysField({ keys: ["array"] })).toEqual({});
  });
});

describe("resolveApiKey", () => {
  const keys = {
    openai: "sk-openai-123",
    anthropic: "sk-ant-456",
  };

  it("should resolve key by auto-detected provider", () => {
    expect(resolveApiKey("gpt-4o-mini", keys, "sk-default")).toBe(
      "sk-openai-123",
    );
    expect(resolveApiKey("claude-haiku-4-5", keys, "sk-default")).toBe(
      "sk-ant-456",
    );
  });

  it("should resolve key from explicit provider prefix", () => {
    expect(resolveApiKey("openai:gpt-4o-mini", keys, "sk-default")).toBe(
      "sk-openai-123",
    );
  });

  it("should fall back to default key when provider not in keys map", () => {
    expect(resolveApiKey("gemini-2.0-flash", keys, "sk-default")).toBe(
      "sk-default",
    );
  });

  it("should fall back to default key when keys map is empty", () => {
    expect(resolveApiKey("gpt-4o-mini", {}, "sk-default")).toBe("sk-default");
  });

  it("should use anthropic key for unknown model (anthropic is default provider)", () => {
    expect(resolveApiKey("unknown-model", keys, "sk-default")).toBe(
      "sk-ant-456",
    );
  });
});
