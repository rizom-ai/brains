import { describe, expect, it } from "bun:test";
import { expectDefined } from "../src/expect-defined";

describe("expectDefined", () => {
  it("returns the value unchanged when it is present", () => {
    const value = { id: "note-1", list: undefined };
    expect(expectDefined(value)).toBe(value);
    expect(expectDefined(0)).toBe(0);
    expect(expectDefined("")).toBe("");
    expect(expectDefined(false)).toBe(false);
  });

  it("throws on undefined so a missing subject fails instead of skipping", () => {
    expect(() => expectDefined(undefined)).toThrow(
      "Expected a value, got undefined",
    );
  });

  it("throws on null", () => {
    expect(() => expectDefined(null)).toThrow("Expected a value, got null");
  });

  it("names the subject in the failure when a label is given", () => {
    expect(() => expectDefined(undefined, "entity-detail template")).toThrow(
      "Expected entity-detail template, got undefined",
    );
  });

  it("narrows the type so callers need no optional chaining", () => {
    const maybe: { list?: string } | undefined = { list: "a" };
    // Compiles only because the return type drops undefined.
    const list: string | undefined = expectDefined(maybe).list;
    expect(list).toBe("a");
  });
});
