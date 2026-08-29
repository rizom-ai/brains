import { describe, expect, it } from "bun:test";
import { isJsonObject, parseJsonObject } from "./json";

describe("isJsonObject", () => {
  it("accepts objects", () => {
    expect(isJsonObject({})).toBe(true);
    expect(isJsonObject({ a: 1 })).toBe(true);
  });

  it("rejects arrays, null, and primitives", () => {
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject("a")).toBe(false);
    expect(isJsonObject(1)).toBe(false);
  });
});

describe("parseJsonObject", () => {
  it("parses an object and types its keys", () => {
    const manifest = parseJsonObject('{"name":"pkg"}', "package.json");
    expect(manifest["name"]).toBe("pkg");
  });

  it("names the source when the JSON is not an object", () => {
    expect(() => parseJsonObject("[1,2]", "package.json")).toThrow(
      /package\.json is not a JSON object/,
    );
    expect(() => parseJsonObject('"a"', "package.json")).toThrow(
      /package\.json is not a JSON object/,
    );
  });

  it("names the source when the JSON is malformed", () => {
    expect(() => parseJsonObject("{oops", "package.json")).toThrow(
      /package\.json is not valid JSON/,
    );
  });
});
