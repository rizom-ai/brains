import { describe, expect, it } from "bun:test";
import { CANONICAL_BUNDLE_IDS } from "@brains/contracts";
import { canonicalBundleIdSchema } from "../src/schema";

describe("the bundles a fleet cohort may name", () => {
  it("are the brain's canonical bundles, from the one shared list", () => {
    expect(canonicalBundleIdSchema.options).toEqual([...CANONICAL_BUNDLE_IDS]);
  });

  it("include the brain's own homeserver", () => {
    expect(canonicalBundleIdSchema.safeParse("matrix").success).toBe(true);
  });
});
