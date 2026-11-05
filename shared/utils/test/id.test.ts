import { describe, expect, it } from "bun:test";
import { createShortId } from "../src/id";

describe("createShortId", () => {
  it("is six lowercase letters and digits by default", () => {
    expect(createShortId()).toMatch(/^[0-9a-z]{6}$/);
  });

  it("takes another length", () => {
    expect(createShortId(10)).toMatch(/^[0-9a-z]{10}$/);
  });
});
