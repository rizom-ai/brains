import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { parseInstanceOverrides, resolve } from "@brains/app";
import rover from "../src";

/**
 * Phase 2 of docs/plans/rizom-consolidation.md: the consolidated rizom.ai
 * brain is rover's default preset plus these adds. `add:` silently ignores
 * ids the brain definition doesn't register, so the equality test below
 * fails loudly if a capability goes missing from rover instead of quietly
 * shipping a brain without it.
 */
const CONSOLIDATION_ADDS = [
  "atproto-registry",
  "products",
  "rizom-ecosystem",
  "newsletter",
] as const;

// The newsletter capability is a composite: it expands to the newsletter
// entity plugin plus its buttondown delivery service, gated as one unit.
const COMPOSITE_EXPANSIONS = ["buttondown"] as const;

function pluginIds(overrides: object): string[] {
  const config = resolve(rover, {}, overrides);
  return (config.plugins?.map((plugin) => plugin.id) ?? []).sort();
}

describe("consolidated rizom.ai brain (test-apps/rizom-ai)", () => {
  const overrides = parseInstanceOverrides(
    readFileSync(
      join(import.meta.dir, "..", "test-apps", "rizom-ai", "brain.yaml"),
      "utf8",
    ),
  );

  it("resolves to exactly rover-default ∪ the consolidation adds", () => {
    const base = pluginIds({ preset: "default" });
    const expected = [
      ...new Set([...base, ...CONSOLIDATION_ADDS, ...COMPOSITE_EXPANSIONS]),
    ].sort();

    expect(pluginIds(overrides)).toEqual(expected);
  });

  it("keeps the canonical lexicon registry served", () => {
    expect(pluginIds(overrides)).toContain("atproto-registry");
  });

  it("carries ranger-ai's product entities", () => {
    expect(pluginIds(overrides)).toContain("products");
    expect(pluginIds(overrides)).toContain("rizom-ecosystem");
  });

  it("backs the /foundation follow band with double-opt-in newsletter", () => {
    expect(pluginIds(overrides)).toContain("newsletter");

    const entry = rover.capabilities.find(([id]) => id === "newsletter");
    expect(entry?.[2]).toMatchObject({ doubleOptIn: true });
  });

  it("serves the consolidated site package", () => {
    expect(overrides.site?.package).toBe("@brains/site-rizom-ai");
    expect(overrides.site?.theme).toBe("@brains/theme-rizom-ai");
  });
});
