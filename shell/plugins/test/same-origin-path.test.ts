import { describe, expect, it } from "bun:test";
import {
  normalizeSameOriginPath,
  setSameOriginSearchParams,
} from "../src/internal/same-origin-path";

describe("normalizeSameOriginPath", () => {
  it("preserves canonical paths and normalizes path traversal", () => {
    expect(
      normalizeSameOriginPath("/studio/workspaces/inbox?source=mail#new"),
    ).toBe("/studio/workspaces/inbox?source=mail#new");
    expect(normalizeSameOriginPath("/studio/../inbox")).toBe("/inbox");
  });

  it("sets encoded query values with explicit preserve or replace semantics", () => {
    expect(
      setSameOriginSearchParams("/admin?view=members#people", [
        ["person", "prsn/id"],
      ]),
    ).toBe("/admin?view=members&person=prsn%2Fid#people");
    expect(
      setSameOriginSearchParams(
        "/old?private=value#stale",
        [
          ["sourceId", "mail-items"],
          ["facet.needs-reply", "true"],
        ],
        { replace: true },
      ),
    ).toBe("/old?sourceId=mail-items&facet.needs-reply=true");
  });

  it("rejects non-path, cross-origin, unsafe, and oversized targets", () => {
    for (const value of [
      undefined,
      "",
      " /inbox",
      "/in box",
      "inbox",
      "//evil.test/inbox",
      "https://evil.test/inbox",
      "/inbox\\private",
      "/inbox\u0000private",
      `/${"x".repeat(2_048)}`,
    ]) {
      expect(normalizeSameOriginPath(value)).toBeUndefined();
    }
  });
});
