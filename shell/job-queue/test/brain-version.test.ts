import { describe, expect, it } from "bun:test";
import { BrainVersionSchema, brainVersionSortKey } from "../src/brain-version";

// Ascending semver precedence, including every prerelease rule.
const ORDERED = [
  "0.1.9",
  "0.2.0-0",
  "0.2.0-1",
  "0.2.0-10",
  "0.2.0-a",
  "0.2.0-a.b",
  "0.2.0-a-b",
  "0.2.0-aB",
  "0.2.0-alpha",
  "0.2.0-alpha.1",
  "0.2.0-alpha.9",
  "0.2.0-alpha.10",
  "0.2.0-alpha.612",
  "0.2.0-alpha.613",
  "0.2.0-alpha.613.1",
  "0.2.0-alpha.beta",
  "0.2.0-beta",
  "0.2.0",
  "0.2.1",
  "0.10.0",
  "1.0.0-rc.1",
  "1.0.0",
  "9.0.0",
  "10.0.0",
  "123456789012.0.0",
];

describe("brain version sort keys", () => {
  it("order exactly as semver precedence does", () => {
    const sign = (value: number): number => Math.sign(value);
    const pairs = ORDERED.flatMap((left) =>
      ORDERED.map((right) => ({ left, right })),
    );

    const mismatches = pairs.filter(
      ({ left, right }) =>
        compareBinary(brainVersionSortKey(left), brainVersionSortKey(right)) !==
        sign(Bun.semver.order(left, right)),
    );

    expect(mismatches).toEqual([]);
  });

  it("ignores build metadata, as precedence does", () => {
    expect(brainVersionSortKey("0.2.0-alpha.612+abc")).toBe(
      brainVersionSortKey("0.2.0-alpha.612"),
    );
  });

  it("accepts semver and rejects anything else", () => {
    expect(BrainVersionSchema.safeParse("0.2.0-alpha.613").success).toBe(true);
    expect(BrainVersionSchema.safeParse("1.0.0").success).toBe(true);
    for (const invalid of ["", "1.0", "v1.0.0", "01.0.0", "1.0.0-", "junk"]) {
      expect(BrainVersionSchema.safeParse(invalid).success).toBe(false);
    }
  });
});

/** SQLite's BINARY collation: plain code-unit order. */
function compareBinary(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
