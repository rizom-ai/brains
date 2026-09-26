import { describe, expect, test } from "bun:test";
import { ProfileKindRegistry } from "../src";
import { z } from "@brains/utils/zod";

const artistDefinition = {
  kind: "artist",
  category: "person" as const,
  fields: z.object({ mediums: z.array(z.string()).optional() }),
  labels: { singular: "Artist", plural: "Artists" },
};

describe("ProfileKindRegistry", () => {
  test("supports a base profile with no selected kind", () => {
    const registry = new ProfileKindRegistry();

    expect(registry.finalize()).toBeNull();
    expect(registry.getResolved()).toBeNull();
  });

  test("resolves one selected kind and derives its category", () => {
    const registry = new ProfileKindRegistry("artist");
    registry.register("artist-plugin", artistDefinition);

    expect(registry.finalize()).toEqual({
      kind: "artist",
      category: "person",
      labels: { singular: "Artist", plural: "Artists" },
    });
    const selectedDefinition = registry.getSelectedDefinition();
    expect(selectedDefinition?.fields).toBe(artistDefinition.fields);
    expect(Object.isFrozen(registry.getResolved())).toBe(true);
    expect(Object.isFrozen(registry.getResolved()?.labels)).toBe(true);
    expect(Object.isFrozen(selectedDefinition)).toBe(true);
    expect(Object.isFrozen(selectedDefinition?.labels)).toBe(true);
  });

  test("publishes only validated metadata and the declared schema", () => {
    const registry = new ProfileKindRegistry("artist");
    const definition = {
      ...artistDefinition,
      privateRuntime: { replaceSelection: (): void => {} },
    };
    registry.register("artist-plugin", definition);
    registry.finalize();
    const selected = registry.getSelectedDefinition();
    expect(Object.keys(selected ?? {}).sort()).toEqual([
      "category",
      "fields",
      "kind",
      "labels",
    ]);
    expect(selected).not.toHaveProperty("privateRuntime");
    expect(selected?.fields).toBe(definition.fields);
  });

  test("does not evaluate undeclared getters and reads the fields schema once", () => {
    const registry = new ProfileKindRegistry("artist");
    let reads = 0;
    const definition = {
      ...artistDefinition,
      get fields(): typeof artistDefinition.fields {
        reads++;
        return artistDefinition.fields;
      },
      get privateRuntime(): never {
        throw new Error("Undeclared getter must not run");
      },
    };
    registry.register("artist-plugin", definition);
    registry.finalize();
    expect(reads).toBe(1);
    expect(registry.getSelectedDefinition()?.fields).toBe(
      artistDefinition.fields,
    );
    expect(registry.getSelectedDefinition()).not.toHaveProperty(
      "privateRuntime",
    );
  });

  test("rejects an unknown selected kind", () => {
    const registry = new ProfileKindRegistry("artist");

    expect(() => registry.finalize()).toThrow(
      'Selected profile kind "artist" is not registered',
    );
  });

  test("rejects duplicate kind keys instead of using registration order", () => {
    const registry = new ProfileKindRegistry("artist");
    registry.register("first-plugin", artistDefinition);
    registry.register("second-plugin", {
      ...artistDefinition,
      category: "organization",
    });

    expect(() => registry.finalize()).toThrow(
      'Profile kind "artist" is registered by multiple plugins: first-plugin, second-plugin',
    );
  });

  test("keeps registries isolated between app instances", () => {
    const first = new ProfileKindRegistry("artist");
    const second = new ProfileKindRegistry("artist");
    first.register("artist-plugin", artistDefinition);

    expect(first.finalize()?.kind).toBe("artist");
    expect(() => second.finalize()).toThrow(
      'Selected profile kind "artist" is not registered',
    );
  });

  test("removes a failed plugin's definitions before finalization", () => {
    const registry = new ProfileKindRegistry("artist");
    registry.register("artist-plugin", artistDefinition);
    registry.unregisterPlugin("artist-plugin");

    expect(() => registry.finalize()).toThrow(
      'Selected profile kind "artist" is not registered',
    );
  });

  test("rejects registration after finalization", () => {
    const registry = new ProfileKindRegistry();
    registry.finalize();

    expect(() => registry.register("artist-plugin", artistDefinition)).toThrow(
      "Profile kind registration is closed",
    );
  });
});
