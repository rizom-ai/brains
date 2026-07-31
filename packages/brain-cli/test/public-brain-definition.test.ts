import { describe, expect, it } from "bun:test";
import { defineBrain } from "../src/entries/index";
import type { BrainDefinition } from "../src/entries/index";

/**
 * True only when T is `unknown` (or `any`). The public brain definition used
 * to hand-mirror the real one and widened its structured fields to `unknown`,
 * which silently dropped completion and type-checking for external authors.
 */
type IsUnknown<T> = [unknown] extends [T] ? true : false;

describe("public brain definition contract", () => {
  it("keeps structured fields typed rather than widening them to unknown", () => {
    const siteStaysTyped: IsUnknown<BrainDefinition["site"]> = false;
    const permissionsStayTyped: IsUnknown<BrainDefinition["permissions"]> =
      false;
    const deploymentStaysTyped: IsUnknown<BrainDefinition["deployment"]> =
      false;

    expect([
      siteStaysTyped,
      permissionsStayTyped,
      deploymentStaysTyped,
    ]).toEqual([false, false, false]);
  });

  it("accepts a definition built against the structured field shapes", () => {
    const definition = defineBrain({
      name: "contract-brain",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
      permissions: { rules: [{ pattern: "discord:*", level: "trusted" }] },
    });

    expect(definition.permissions?.rules?.[0]?.level).toBe("trusted");
  });
});
