import { describe, expect, it } from "bun:test";
import { use } from "../src/configured-plugin";
import {
  getBrainPackageMetadata,
  getPackageMetadata,
  hasPackage,
  registerPackage,
} from "../src/package-registry";
import {
  createPluginPackageDefinition,
  getPluginPackageMetadata,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

describe("configured plugin definitions", () => {
  it("keeps typed non-secret defaults without parsing required instance config", () => {
    const definition = createPluginPackageDefinition({
      family: "message-interface",
      id: "campfire",
      config: z.object({
        baseUrl: z.url().default("https://campfire.example"),
        token: z.string().min(1),
      }),
      instantiate: () => [],
    });

    const configured = use(definition, {
      baseUrl: "https://reader.example",
    });

    expect(configured.kind).toBe("rizom-configured-plugin");
    expect(configured.definition).toBe(definition);
    expect(configured.config).toEqual({
      baseUrl: "https://reader.example",
    });
    expect(Object.isFrozen(configured)).toBeTrue();
    expect(Object.isFrozen(configured.config)).toBeTrue();
  });

  it("accepts an omitted defaults object", () => {
    const definition = createPluginPackageDefinition({
      family: "entity",
      id: "reading-library",
      config: z.object({}),
      instantiate: () => [],
    });

    expect(use(definition).config).toEqual({});
  });

  it("rejects hand-written definition objects", () => {
    expect(() =>
      use({
        kind: "rizom-plugin-package",
        family: "service",
        id: "hand-written",
        config: z.object({}),
      }),
    ).toThrow("returned by a @rizom/brain define helper");
  });

  it("binds installed package metadata during registration", () => {
    const definition = createPluginPackageDefinition({
      family: "service",
      id: "registered-service",
      config: z.object({}),
      instantiate: () => [],
    });

    expect(() =>
      registerPackage("@fixture/missing-version", definition),
    ).toThrow("must be registered with its installed version");
    expect(hasPackage("@fixture/missing-version")).toBeFalse();

    registerPackage("@fixture/registered-service", definition, {
      version: "0.1.0",
    });

    expect(getPackageMetadata("@fixture/registered-service")).toEqual({
      name: "@fixture/registered-service",
      version: "0.1.0",
    });
    expect(getPluginPackageMetadata(definition)).toEqual({
      name: "@fixture/registered-service",
      version: "0.1.0",
    });

    const brain = { name: "fixture", plugins: [use(definition)] };
    registerPackage("@fixture/reader-brain", brain, { version: "0.2.0" });
    expect(getBrainPackageMetadata(brain)).toEqual({
      name: "@fixture/reader-brain",
      version: "0.2.0",
    });
  });
});
