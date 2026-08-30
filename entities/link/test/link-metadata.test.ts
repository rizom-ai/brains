import { describe, expect, it } from "bun:test";
import { readLinkStatus } from "../src/schemas/link";

describe("readLinkStatus", () => {
  it("reads each member of the status union", () => {
    expect(readLinkStatus({ status: "pending" })).toBe("pending");
    expect(readLinkStatus({ status: "draft" })).toBe("draft");
    expect(readLinkStatus({ status: "published" })).toBe("published");
  });

  it("rejects a string outside the union rather than passing it through", () => {
    expect(() => readLinkStatus({ status: "archived" })).toThrow();
  });

  it("rejects a missing or non-string status", () => {
    expect(() => readLinkStatus({})).toThrow();
    expect(() => readLinkStatus({ status: 3 })).toThrow();
    expect(() => readLinkStatus({ status: null })).toThrow();
  });

  it("ignores unrelated metadata keys", () => {
    expect(readLinkStatus({ status: "draft", title: "x", extra: 1 })).toBe(
      "draft",
    );
  });
});
