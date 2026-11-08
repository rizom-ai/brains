import { describe, expect, it } from "bun:test";
import { use } from "@brains/sdk";
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

describe("configured plugin packages in the registry", () => {
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
