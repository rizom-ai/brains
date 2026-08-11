import { describe, expect, it } from "bun:test";
import {
  PluginConfigValidationError,
  createPluginPackageDefinition,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { defineBrain, defineBundle } from "../src/contracts/brain-definition";
import { resolve } from "../src/brain-resolver";
import { use } from "../src/configured-plugin";
import { normalizeDeclarativeBrainDefinition } from "../src/declarative-brain";
import { registerPackage } from "../src/package-registry";

function testPlugin(input: {
  id: string;
  packageName: string;
  version: string;
}): Plugin {
  return {
    ...input,
    type: "service",
    async register(): Promise<PluginCapabilities> {
      return { tools: [], resources: [] };
    },
  };
}

describe("declarative brain normalization", () => {
  it("normalizes object references and inferred package metadata", () => {
    const service = createPluginPackageDefinition({
      family: "service",
      id: "reading-insights",
      config: z.object({ label: z.string().trim().default("Reading") }),
      instantiate: ({ config, package: metadata, scope }) =>
        testPlugin({
          id: scope(`reading-${config.label.toLowerCase()}`),
          packageName: metadata.name,
          version: metadata.version,
        }),
    });
    registerPackage("@fixture/reading-insights", service, {
      version: "0.1.0",
    });

    const configured = use(service, { label: "Default" });
    const core = defineBundle({
      id: "core",
      members: [configured],
      config: [{ member: configured, value: { label: "Bundle" } }],
      evalDisable: [configured],
    });
    const brain = defineBrain({
      name: "reader",
      plugins: [configured],
      bundles: [core],
      evalDisable: [configured],
    });
    registerPackage("@fixture/reader-brain", brain, { version: "0.2.0" });

    const normalized = normalizeDeclarativeBrainDefinition(brain);

    expect(normalized.version).toBe("0.2.0");
    expect(normalized.interfaces).toEqual([]);
    expect(normalized.bundles).toEqual([
      {
        id: "core",
        members: ["reading-insights"],
        config: [{ member: "reading-insights", value: { label: "Bundle" } }],
        evalDisable: ["reading-insights"],
      },
    ]);
    expect(normalized.evalDisable).toEqual(["reading-insights"]);

    const [, factory, defaults] = normalized.capabilities[0] ?? [];
    expect(defaults).toEqual({ label: "Default" });
    expect(factory?.({ label: "  Saved  " })).toEqual([
      expect.objectContaining({
        id: "@fixture/reading-insights:reading-saved",
        packageName: "@fixture/reading-insights",
        version: "0.1.0",
      }),
    ]);

    const resolved = resolve(
      brain,
      {},
      {
        bundles: ["core"],
        plugins: { "reading-insights": { label: "  Instance  " } },
      },
    );
    expect(resolved.version).toBe("0.2.0");
    expect(resolved.plugins).toEqual([
      expect.objectContaining({
        id: "@fixture/reading-insights:reading-instance",
      }),
    ]);
  });

  it("requires metadata for both brain and plugin packages", () => {
    const service = createPluginPackageDefinition({
      family: "service",
      id: "missing-metadata",
      config: z.object({}),
      instantiate: () => [],
    });
    const configured = use(service);
    const brain = defineBrain({ name: "missing", plugins: [configured] });

    expect(() => normalizeDeclarativeBrainDefinition(brain)).toThrow(
      'Brain definition "missing" is missing installed package metadata',
    );

    registerPackage("@fixture/missing-brain", brain, { version: "0.2.0" });
    expect(() => normalizeDeclarativeBrainDefinition(brain)).toThrow(
      'Plugin package metadata is missing for definition "missing-metadata"',
    );
  });

  it("turns schema failures into actionable package diagnostics", () => {
    const service = createPluginPackageDefinition({
      family: "service",
      id: "validated-service",
      config: z.object({ token: z.string().min(1) }),
      instantiate: () => [],
    });
    registerPackage("@fixture/validated-service", service, {
      version: "0.1.0",
    });
    const configured = use(service);
    const brain = defineBrain({ name: "validated", plugins: [configured] });
    registerPackage("@fixture/validated-brain", brain, { version: "0.2.0" });

    const normalized = normalizeDeclarativeBrainDefinition(brain);
    const factory = normalized.capabilities[0]?.[1];
    expect(() => factory?.({ token: "" })).toThrow(
      'Invalid config for plugin package definition "validated-service" (@fixture/validated-service:validated-service): token:',
    );

    try {
      factory?.({ token: "" });
    } catch (error) {
      expect(error).not.toBeInstanceOf(PluginConfigValidationError);
    }
  });
});
