import { describe, it, expect } from "bun:test";
import { isPlainRecord, isErrnoException } from "../src/predicates";

describe("isPlainRecord", () => {
  it("accepts object literals and null-prototype objects", () => {
    expect(isPlainRecord({})).toBe(true);
    expect(isPlainRecord({ a: 1 })).toBe(true);
    expect(isPlainRecord(Object.create(null))).toBe(true);
  });

  it("rejects arrays, null, and primitives", () => {
    expect(isPlainRecord([])).toBe(false);
    expect(isPlainRecord(null)).toBe(false);
    expect(isPlainRecord(undefined)).toBe(false);
    expect(isPlainRecord("a")).toBe(false);
    expect(isPlainRecord(1)).toBe(false);
  });

  it("rejects class instances and exotic objects", () => {
    class Thing {}
    expect(isPlainRecord(new Thing())).toBe(false);
    expect(isPlainRecord(new Date())).toBe(false);
    expect(isPlainRecord(new Map())).toBe(false);
    expect(isPlainRecord(() => undefined)).toBe(false);
  });

  it("narrows to an indexable record", () => {
    const value: unknown = { a: 1 };
    if (!isPlainRecord(value)) throw new Error("expected a record");
    expect(value["a"]).toBe(1);
  });
});

describe("isErrnoException", () => {
  it("accepts errors carrying a string code", () => {
    const error = Object.assign(new Error("missing"), { code: "ENOENT" });
    expect(isErrnoException(error)).toBe(true);
  });

  it("rejects errors without a code", () => {
    expect(isErrnoException(new Error("plain"))).toBe(false);
  });

  it("rejects errors whose code is not a string", () => {
    const error = Object.assign(new Error("weird"), { code: 42 });
    expect(isErrnoException(error)).toBe(false);
  });

  it("rejects non-errors, including code-carrying plain objects", () => {
    expect(isErrnoException({ code: "ENOENT" })).toBe(false);
    expect(isErrnoException("ENOENT")).toBe(false);
    expect(isErrnoException(null)).toBe(false);
  });

  it("narrows so code is readable without an assertion", () => {
    const error: unknown = Object.assign(new Error("missing"), {
      code: "ENOENT",
    });
    if (!isErrnoException(error)) throw new Error("expected an errno error");
    expect(error.code).toBe("ENOENT");
    expect(error.message).toBe("missing");
  });
});
