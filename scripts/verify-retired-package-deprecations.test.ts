import { describe, expect, it } from "bun:test";
import { assertRetiredPackageDeprecations } from "./verify-retired-package-deprecations";

describe("retired package deprecation verification", () => {
  it("requires every alpha to point authors to the canonical SDK", () => {
    expect(
      assertRetiredPackageDeprecations({
        versions: {
          "0.2.0-alpha.1": {
            deprecated: "Retired; migrate to @rizom/site.",
          },
          "0.2.0-alpha.2": {
            deprecated: "Use @rizom/site instead.",
          },
          "1.0.0": {},
        },
      }),
    ).toBe(2);
  });

  it("names every alpha missing a canonical migration pointer", () => {
    expect(() =>
      assertRetiredPackageDeprecations({
        versions: {
          "0.2.0-alpha.1": {},
          "0.2.0-alpha.2": { deprecated: "Package retired" },
        },
      }),
    ).toThrow("0.2.0-alpha.1, 0.2.0-alpha.2");
  });
});
