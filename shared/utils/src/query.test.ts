import { describe, expect, it } from "bun:test";
import { queryInteger } from "./query";

describe("queryInteger", () => {
  it("converts only canonical non-negative integer strings", () => {
    expect(queryInteger("0")).toBe(0);
    expect(queryInteger("25")).toBe(25);
    expect(queryInteger(" 25")).toBe(" 25");
    expect(queryInteger("2.5")).toBe("2.5");
    expect(queryInteger("-1")).toBe("-1");
    expect(queryInteger(undefined)).toBeUndefined();
  });
});
