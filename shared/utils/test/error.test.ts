import { describe, expect, it } from "bun:test";
import { getErrorMessage, toError } from "../src/error";

describe("getErrorMessage", () => {
  it("returns the message of an Error instance", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("stringifies non-Error values", () => {
    expect(getErrorMessage("plain string")).toBe("plain string");
    expect(getErrorMessage(42)).toBe("42");
  });

  it("returns the fallback for non-Error values when provided", () => {
    expect(getErrorMessage({ odd: true }, "Unknown error")).toBe(
      "Unknown error",
    );
    expect(getErrorMessage(undefined, "Unknown error")).toBe("Unknown error");
  });

  it("ignores the fallback when the value is an Error", () => {
    expect(getErrorMessage(new Error("boom"), "Unknown error")).toBe("boom");
  });
});

describe("toError", () => {
  it("preserves Error instances", () => {
    const original = new TypeError("bad");
    expect(toError(original)).toBe(original);
  });

  it("wraps non-Error values", () => {
    const wrapped = toError("oops");
    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped.message).toBe("oops");
  });
});
