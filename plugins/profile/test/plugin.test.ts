import { describe, expect, test } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import profilePackage from "../src";
import { installProfile } from "./profile-plugin";

function createHarness(
  profileKind?: string,
): ReturnType<typeof createPluginHarness> {
  return createPluginHarness({
    ...(profileKind && { profileKind }),
  });
}

function captureExtendedFields(
  harness: ReturnType<typeof createHarness>,
): Set<string> {
  const fields = new Set<string>();
  harness.getEntityRegistry().extendFrontmatterSchema = (
    _type,
    schema,
  ): void => {
    for (const field of Object.keys(schema.shape)) fields.add(field);
  };
  return fields;
}

describe("profile composition", () => {
  test("default-exports its service package definition", () => {
    expect(profilePackage).toMatchObject({
      kind: "rizom-plugin-package",
      family: "service",
      id: "profile",
    });
  });

  test("registers under the plugin id its class had, with no tools", async () => {
    const harness = createHarness();
    const plugin = await installProfile(harness, {
      starterIdentity: { enabled: false },
    });

    expect([plugin.id, plugin.type, plugin.packageName]).toEqual([
      "profile",
      "service",
      "@brains/profile",
    ]);
    expect(harness.getCapabilities().tools).toEqual([]);
  });

  test("installs only base profile fields when no kind is selected", async () => {
    const harness = createHarness();
    const fields = captureExtendedFields(harness);
    await installProfile(harness, { starterIdentity: { enabled: false } });
    await harness.finalizeRegistration();

    expect(fields).toContain("tagline");
    expect(fields).not.toContain("kind");
    expect(fields).not.toContain("role");
  });

  test("installs fields for the composition-selected kind", async () => {
    const harness = createHarness("professional");
    const fields = captureExtendedFields(harness);
    await installProfile(harness, { starterIdentity: { enabled: false } });
    await harness.finalizeRegistration();

    expect(fields).toContain("role");
    expect(fields).toContain("expertise");
    expect(fields).not.toContain("mission");
    expect(
      harness.getMockShell().getProfileKindRegistry().getResolved(),
    ).toEqual({
      kind: "professional",
      category: "person",
      labels: { singular: "Professional", plural: "Professionals" },
    });
  });

  test("supports an external kind registered into a closed category", async () => {
    const harness = createHarness("artist");
    harness
      .getMockShell()
      .getProfileKindRegistry()
      .register("artist-plugin", {
        kind: "artist",
        category: "person",
        fields: z.object({ mediums: z.array(z.string()).optional() }),
        labels: { singular: "Artist", plural: "Artists" },
      });
    const fields = captureExtendedFields(harness);
    await installProfile(harness, { starterIdentity: { enabled: false } });
    await harness.finalizeRegistration();

    expect(fields).toContain("mediums");
    expect(fields).not.toContain("role");
  });

  test("rejects an unknown selected kind before profile finalization", async () => {
    const harness = createHarness("artist");
    await installProfile(harness, { starterIdentity: { enabled: false } });

    expect(harness.finalizeRegistration()).rejects.toThrow(
      'Selected profile kind "artist" is not registered',
    );
  });

  test("rejects a built-in kind collision", async () => {
    const harness = createHarness("professional");
    harness
      .getMockShell()
      .getProfileKindRegistry()
      .register("duplicate-professional", {
        kind: "professional",
        category: "organization",
        fields: z.object({ mission: z.string().optional() }),
        labels: { singular: "Duplicate", plural: "Duplicates" },
      });
    await installProfile(harness, { starterIdentity: { enabled: false } });

    expect(harness.finalizeRegistration()).rejects.toThrow(
      'Profile kind "professional" is registered by multiple plugins',
    );
  });
});
