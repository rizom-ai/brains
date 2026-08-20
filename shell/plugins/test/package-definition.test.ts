import { describe, expect, expectTypeOf, it } from "bun:test";
import {
  PluginConfigValidationError,
  createPluginPackageDefinition,
  instantiatePluginPackageDefinition,
  isPluginPackageDefinition,
  type Plugin,
  type PluginCapabilities,
} from "../src";
import { z } from "@brains/utils/zod";

function testPlugin(input: {
  id: string;
  packageName: string;
  version: string;
  type?: Plugin["type"];
}): Plugin {
  return {
    id: input.id,
    packageName: input.packageName,
    version: input.version,
    type: input.type ?? "service",
    async register(): Promise<PluginCapabilities> {
      return { tools: [], resources: [] };
    },
  };
}

describe("plugin package definitions", () => {
  it("keeps runtime construction hidden while preserving schema inference", () => {
    const definition = createPluginPackageDefinition({
      family: "service",
      id: "reading-insights",
      config: z.object({
        label: z.string().trim().default("Reading"),
      }),
      instantiate: ({ config, package: metadata, scope }) =>
        testPlugin({
          id: scope(`reading-insights-${config.label.toLowerCase()}`),
          packageName: metadata.name,
          version: metadata.version,
        }),
    });

    expectTypeOf(definition.family).toEqualTypeOf<"service">();
    expect(isPluginPackageDefinition(definition)).toBeTrue();
    expect(Object.keys(definition).sort()).toEqual([
      "config",
      "family",
      "id",
      "kind",
    ]);
    expect(JSON.stringify(definition)).not.toContain("instantiate");

    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      { label: "  Saved  " },
      { name: "@fixture/reading-insights", version: "0.1.0" },
    );

    expect(plugin).toMatchObject({
      id: "@fixture/reading-insights:reading-insights-saved",
      packageName: "@fixture/reading-insights",
      version: "0.1.0",
    });
  });

  it("applies schema defaults exactly once before construction", () => {
    let receivedLabel: string | undefined;
    const definition = createPluginPackageDefinition({
      family: "service",
      id: "defaulted-service",
      config: z.object({ label: z.string().default("Default label") }),
      instantiate: ({ config, package: metadata, scope }) => {
        receivedLabel = config.label;
        return testPlugin({
          id: scope("defaulted-service"),
          packageName: metadata.name,
          version: metadata.version,
        });
      },
    });

    instantiatePluginPackageDefinition(
      definition,
      {},
      {
        name: "@fixture/defaulted-service",
        version: "0.1.0",
      },
    );

    expect(receivedLabel).toBe("Default label");
  });

  it("reports package, definition, field, and validation issue", () => {
    const definition = createPluginPackageDefinition({
      family: "interface",
      id: "reading-webhook",
      config: z.object({ token: z.string().min(1) }),
      instantiate: ({ package: metadata, scope }) =>
        testPlugin({
          id: scope("reading-webhook"),
          packageName: metadata.name,
          version: metadata.version,
          type: "interface",
        }),
    });

    expect(() =>
      instantiatePluginPackageDefinition(
        definition,
        { token: "" },
        { name: "@fixture/reading-webhook", version: "0.1.0" },
      ),
    ).toThrow(PluginConfigValidationError);

    try {
      instantiatePluginPackageDefinition(
        definition,
        { token: "" },
        { name: "@fixture/reading-webhook", version: "0.1.0" },
      );
      throw new Error("Expected config validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(PluginConfigValidationError);
      if (!(error instanceof PluginConfigValidationError)) return;
      expect(error.pluginId).toBe("@fixture/reading-webhook:reading-webhook");
      expect(error.issues[0]?.path).toBe("token");
      expect(error.issues[0]?.message).toContain("expected string");
      expect(error.message).toContain(
        "Invalid plugin config for @fixture/reading-webhook:reading-webhook",
      );
      expect(error.message).toContain("token:");
      expect(error.message).toContain("brain.yaml");
      expect(error.message).toContain("use() configuration");
    }
  });

  it("rejects hand-written package objects and invalid local ids", () => {
    const handWritten = {
      kind: "rizom-plugin-package",
      family: "service",
      id: "hand-written",
      config: z.object({}),
    } as const;

    expect(() =>
      instantiatePluginPackageDefinition(
        handWritten,
        {},
        {
          name: "@fixture/hand-written",
          version: "0.1.0",
        },
      ),
    ).toThrow("export the result of a @rizom/brain define helper");

    expect(() =>
      createPluginPackageDefinition({
        family: "service",
        id: "Invalid Service",
        config: z.object({}),
        instantiate: ({ package: metadata }) =>
          testPlugin({
            id: "invalid-service",
            packageName: metadata.name,
            version: metadata.version,
          }),
      }),
    ).toThrow("Plugin definition id must start with a lowercase letter");
  });
});
