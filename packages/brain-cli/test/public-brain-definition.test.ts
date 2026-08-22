import { describe, expect, it } from "bun:test";
import { defineBrain, defineBundle, use } from "../src/entries/index";
import type { BrainDefinition } from "../src/entries/index";
import { createPluginPackageDefinition } from "@brains/plugins";
import { z } from "@brains/utils/zod";

type IsUnknown<T> = [unknown] extends [T] ? true : false;

function configuredFixture(): ReturnType<typeof use> {
  const definition = createPluginPackageDefinition({
    family: "service",
    id: "fixture-service",
    config: z.object({ greeting: z.string().default("hello") }),
    instantiate: () => [],
  });
  return use(definition, { greeting: "hi" });
}

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

  it("composes configured definitions without tuple factories", () => {
    const fixture = configuredFixture();
    const core = defineBundle({ id: "core", members: [fixture] });
    const definition = defineBrain({
      name: "contract-brain",
      plugins: [fixture],
      bundles: [core],
      permissions: { rules: [{ pattern: "discord:*", level: "trusted" }] },
    });

    expect(definition.plugins).toEqual([fixture]);
    expect(definition.bundles?.[0]?.members).toEqual([fixture]);
    expect(definition.permissions?.rules?.[0]?.level).toBe("trusted");
  });

  it("allows policy-only bundles to target catalog plugins", () => {
    const fixture = configuredFixture();
    const team = defineBundle({
      id: "team",
      members: [],
      config: [{ member: fixture, value: { greeting: "shared" } }],
      permissions: [
        {
          member: fixture,
          config: { rules: [{ pattern: "fixture:*", level: "trusted" }] },
        },
      ],
      evalDisable: [fixture],
    });
    const definition = defineBrain({
      name: "policy-brain",
      plugins: [fixture],
      bundles: [team],
    });

    expect(definition.bundles?.[0]).toBe(team);
  });

  it("rejects duplicate local ids from different packages", () => {
    const first = configuredFixture();
    const second = configuredFixture();

    expect(() =>
      defineBrain({
        name: "ambiguous-brain",
        plugins: [first, second],
      }),
    ).toThrow(
      'duplicate local plugin id "fixture-service"; give each package definition a unique local id before composing it',
    );
  });

  it("rejects bundle members outside the brain catalog", () => {
    const included = configuredFixture();
    const excluded = configuredFixture();
    const bundle = defineBundle({ id: "invalid", members: [excluded] });

    expect(() =>
      defineBrain({
        name: "invalid-brain",
        plugins: [included],
        bundles: [bundle],
      }),
    ).toThrow('bundle "invalid" references a plugin outside its catalog');
  });

  it("rejects policy targets outside the brain catalog", () => {
    const included = configuredFixture();
    const excluded = configuredFixture();
    const bundle = defineBundle({
      id: "invalid-policy",
      members: [],
      config: [{ member: excluded, value: { greeting: "outside" } }],
    });

    expect(() =>
      defineBrain({
        name: "invalid-policy-brain",
        plugins: [included],
        bundles: [bundle],
      }),
    ).toThrow(
      'bundle "invalid-policy" config references a plugin outside its catalog',
    );
  });
});
