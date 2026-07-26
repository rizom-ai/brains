import { describe, expect, test } from "bun:test";
import type { IShell, Plugin, PluginCapabilities } from "@brains/plugins";
import type { PermissionConfig } from "@brains/templates";
import { defineBundle } from "../src/bundle-definition";
import {
  defineBrain,
  type BrainDefinition,
  type CapabilityContext,
  type PluginConfig,
  type PluginFactory,
} from "../src/brain-definition";
import { resolve } from "../src/brain-resolver";
import {
  CONVENTIONAL_SITE_PACKAGE_REF,
  InstanceOverridesParseError,
  applyConventionalSiteRefs,
  parseInstanceOverrides,
} from "../src/instance-overrides";
import { registerPackage } from "../src/package-registry";
import type { SitePackage } from "../src/site-package";

interface ConfigPlugin extends Plugin {
  config: PluginConfig;
}

function createPlugin(
  id: string,
  config: PluginConfig,
  entityActionPolicy?: Plugin["entityActionPolicy"],
): ConfigPlugin {
  return {
    id,
    version: "1.0.0",
    type: "service",
    packageName: `@test/${id}`,
    config,
    ...(entityActionPolicy ? { entityActionPolicy } : {}),
  } as ConfigPlugin;
}

function trackingFactory(
  id: string,
  configs: PluginConfig[] = [],
  entityActionPolicy?: Plugin["entityActionPolicy"],
): PluginFactory {
  return (config) => {
    configs.push(config);
    return createPlugin(id, config, entityActionPolicy);
  };
}

function pluginIds(config: ReturnType<typeof resolve>): string[] {
  return config.plugins?.map(({ id }) => id) ?? [];
}

describe("brain.yaml bundle selection", () => {
  test("parses bundles and rejects mixing bundles with a preset", () => {
    expect(
      parseInstanceOverrides(`brain: "@brains/rover"
bundles: [site, core]
add: [products]
remove: [analytics]
`),
    ).toMatchObject({
      bundles: ["site", "core"],
      add: ["products"],
      remove: ["analytics"],
    });

    expect(() =>
      parseInstanceOverrides(`brain: "@brains/rover"
preset: core
bundles: [core]
`),
    ).toThrow(InstanceOverridesParseError);
    expect(() =>
      parseInstanceOverrides(`brain: "@brains/rover"
preset: core
bundles: [core]
`),
    ).toThrow(/preset.*bundles.*mutually exclusive/i);
  });

  test("also rejects programmatic preset and bundle selection", () => {
    const definition = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [["alpha", trackingFactory("alpha"), {}]],
      interfaces: [],
      presets: { core: ["alpha"] },
      bundles: [defineBundle({ id: "core", members: ["alpha"] })],
    });

    expect(() =>
      resolve(definition, {}, { preset: "core", bundles: ["core"] }),
    ).toThrow(/preset.*bundles.*mutually exclusive/i);
  });
});

describe("bundle resolver integration", () => {
  test("selects capabilities in catalog order regardless of YAML bundle order", () => {
    const definition = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        ["alpha", trackingFactory("alpha"), {}],
        ["beta", trackingFactory("beta"), {}],
        ["gamma", trackingFactory("gamma"), {}],
      ],
      interfaces: [],
      bundles: [
        defineBundle({ id: "core", members: ["beta", "alpha"] }),
        defineBundle({ id: "site", members: ["gamma"] }),
      ],
    });

    const forward = resolve(definition, {}, { bundles: ["core", "site"] });
    const reverse = resolve(definition, {}, { bundles: ["site", "core"] });

    expect(pluginIds(forward)).toEqual(["alpha", "beta", "gamma"]);
    expect(pluginIds(reverse)).toEqual(pluginIds(forward));
  });

  test("passes canonical bundles to config callbacks and preserves legacy preset context", () => {
    const contexts: CapabilityContext[] = [];
    const definition = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        [
          "alpha",
          trackingFactory("alpha"),
          (_env, context): PluginConfig => {
            contexts.push(context);
            return {};
          },
        ],
      ],
      interfaces: [],
      presets: { core: ["alpha"] },
      bundles: [
        defineBundle({ id: "core", members: ["alpha"] }),
        defineBundle({ id: "site", members: ["alpha"] }),
      ],
    });

    resolve(definition, {}, { bundles: ["site", "core"] });
    resolve(definition, {}, { preset: "core" });

    expect(contexts).toEqual([
      { bundles: ["core", "site"] },
      { bundles: [], preset: "core" },
    ]);
  });

  test("applies catalog, bundle, then instance config to capabilities and interfaces", () => {
    const capabilityConfigs: PluginConfig[] = [];
    const interfaceConfigs: PluginConfig[] = [];

    class TestInterface implements Plugin {
      readonly id = "web";
      readonly version = "1.0.0";
      readonly type = "interface" as const;
      readonly packageName = "@test/web";

      constructor(config: PluginConfig) {
        interfaceConfigs.push(config);
      }

      async register(_shell: IShell): Promise<PluginCapabilities> {
        return { tools: [], resources: [] };
      }
    }

    const definition = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        [
          "alpha",
          trackingFactory("alpha", capabilityConfigs),
          { nested: { baseOnly: true, shared: "base" } },
        ],
      ],
      interfaces: [
        [
          "web",
          TestInterface,
          (): PluginConfig => ({
            nested: { baseOnly: true, shared: "base" },
          }),
        ],
      ],
      bundles: [
        defineBundle({
          id: "core",
          members: ["alpha", "web"],
          config: [
            {
              member: "alpha",
              value: { nested: { bundleOnly: true, shared: "bundle" } },
            },
            {
              member: "web",
              value: { nested: { bundleOnly: true, shared: "bundle" } },
            },
          ],
        }),
      ],
    });

    resolve(
      definition,
      {},
      {
        bundles: ["core"],
        plugins: {
          alpha: { nested: { instanceOnly: true, shared: "instance" } },
          web: { nested: { instanceOnly: true, shared: "instance" } },
        },
      },
    );

    const expected = {
      nested: {
        baseOnly: true,
        bundleOnly: true,
        instanceOnly: true,
        shared: "instance",
      },
    };
    expect(capabilityConfigs).toEqual([expected]);
    expect(interfaceConfigs).toEqual([expected]);
  });

  test("composes definition and bundle instructions in canonical order", () => {
    const definition = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [["alpha", trackingFactory("alpha"), {}]],
      interfaces: [],
      agentInstructions: ["base"],
      bundles: [
        defineBundle({
          id: "core",
          members: ["alpha"],
          agentInstructions: ["core"],
        }),
        defineBundle({
          id: "team",
          members: ["alpha"],
          agentInstructions: ["team"],
        }),
      ],
    });

    expect(
      resolve(definition, {}, { bundles: ["team", "core"] }).agentInstructions,
    ).toEqual(["base", "core", "team"]);
  });

  test("applies global eval exclusions before add and remove", () => {
    const definition = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [
        ["alpha", trackingFactory("alpha"), {}],
        ["beta", trackingFactory("beta"), {}],
      ],
      interfaces: [],
      evalDisable: ["beta"],
      bundles: [defineBundle({ id: "core", members: ["alpha", "beta"] })],
    });

    expect(
      pluginIds(resolve(definition, {}, { bundles: ["core"], mode: "eval" })),
    ).toEqual(["alpha"]);
    expect(
      pluginIds(
        resolve(
          definition,
          {},
          {
            bundles: ["core"],
            mode: "eval",
            add: ["beta"],
            remove: ["alpha"],
          },
        ),
      ),
    ).toEqual(["beta"]);
  });

  test("keeps legacy preset and no-preset behavior on the shared selection path", () => {
    const presetDefinition = defineBrain({
      name: "preset",
      version: "1.0.0",
      capabilities: [
        ["alpha", trackingFactory("alpha"), {}],
        ["beta", trackingFactory("beta"), {}],
      ],
      interfaces: [],
      presets: { core: ["alpha"] },
      bundles: [defineBundle({ id: "core", members: ["alpha"] })],
    });
    const noPresetDefinition = defineBrain({
      name: "all",
      version: "1.0.0",
      capabilities: [
        ["alpha", trackingFactory("alpha"), {}],
        ["beta", trackingFactory("beta"), {}],
      ],
      interfaces: [],
      bundles: [defineBundle({ id: "core", members: ["alpha"] })],
    });

    expect(
      pluginIds(resolve(presetDefinition, {}, { preset: "core" })),
    ).toEqual(pluginIds(resolve(presetDefinition, {}, { bundles: ["core"] })));
    expect(pluginIds(resolve(noPresetDefinition, {}))).toEqual([
      "alpha",
      "beta",
    ]);
  });

  test("preserves conventional local site package resolution", () => {
    const localSite: SitePackage = {
      layouts: { default: null },
      routes: [{ id: "home", path: "/", title: "Home" }],
      entityDisplay: {},
      plugin: (config) => createPlugin("local-site", config ?? {}),
    };
    registerPackage(CONVENTIONAL_SITE_PACKAGE_REF, localSite);
    const definition = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [["site-builder", trackingFactory("site-builder"), {}]],
      interfaces: [],
      bundles: [defineBundle({ id: "site", members: ["site-builder"] })],
    });
    const overrides = applyConventionalSiteRefs(
      { bundles: ["site"] },
      { sitePackageRef: CONVENTIONAL_SITE_PACKAGE_REF },
    );

    expect(pluginIds(resolve(definition, {}, overrides))).toEqual([
      "local-site",
      "site-builder",
    ]);
  });

  test("preserves external plugin declarations and remove semantics", () => {
    registerPackage(
      "@rizom/brain-plugin-bundle-calendar",
      trackingFactory("calendar"),
    );
    const definition = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [["alpha", trackingFactory("alpha"), {}]],
      interfaces: [],
      bundles: [defineBundle({ id: "core", members: ["alpha"] })],
    });
    const plugins = {
      calendar: {
        package: "@rizom/brain-plugin-bundle-calendar",
        config: { timezone: "UTC" },
      },
    };

    expect(
      pluginIds(resolve(definition, {}, { bundles: ["core"], plugins })),
    ).toEqual(["alpha", "calendar"]);
    expect(
      pluginIds(
        resolve(
          definition,
          {},
          {
            bundles: ["core"],
            plugins,
            remove: ["calendar"],
          },
        ),
      ),
    ).toEqual(["alpha"]);
  });

  test("creates fresh configs and plugins on repeated bundle resolution", () => {
    const configs: PluginConfig[] = [];
    const definition = defineBrain({
      name: "test",
      version: "1.0.0",
      capabilities: [["alpha", trackingFactory("alpha", configs), {}]],
      interfaces: [],
      bundles: [
        defineBundle({
          id: "core",
          members: ["alpha"],
          config: [{ member: "alpha", value: { nested: { enabled: true } } }],
        }),
      ],
    });

    const first = resolve(definition, {}, { bundles: ["core"] });
    const second = resolve(definition, {}, { bundles: ["core"] });

    expect(first.plugins?.[0]).not.toBe(second.plugins?.[0]);
    expect(configs[0]).not.toBe(configs[1]);
    expect(configs).toEqual([
      { nested: { enabled: true } },
      { nested: { enabled: true } },
    ]);
  });
});

describe("bundle permission integration", () => {
  function permissionDefinition(teamOverrides = true): BrainDefinition {
    const policyPlugin = trackingFactory("alpha", [], {
      note: { create: "public" },
    });
    return defineBrain({
      name: "permissions",
      version: "1.0.0",
      capabilities: [["alpha", policyPlugin, {}]],
      interfaces: [],
      permissions: {
        rules: [{ pattern: "mcp:*", level: "admin" }],
        entityActions: { note: { create: "admin" } },
      },
      bundles: [
        defineBundle({
          id: "core",
          members: ["alpha"],
          permissions: [
            {
              member: "alpha",
              config: {
                rules: [{ pattern: "web-chat:*", level: "admin" }],
                entityActions: { note: { create: "admin" } },
              },
            },
          ],
        }),
        defineBundle({
          id: "team",
          members: ["alpha"],
          permissions: [
            {
              member: "alpha",
              config: {
                rules: [{ pattern: "web-chat:*", level: "trusted" }],
                entityActions: { note: { create: "trusted" } },
              },
              ...(teamOverrides ? { overrides: "core" } : {}),
            },
          ],
        }),
      ],
    });
  }

  test("applies plugin, definition, bundle, then instance permission precedence", () => {
    const definition = permissionDefinition();
    const bundled = resolve(definition, {}, { bundles: ["team", "core"] });
    const bundledPermissions = bundled.permissions as PermissionConfig;

    expect(bundledPermissions.rules).toEqual([
      { pattern: "mcp:*", level: "admin" },
      { pattern: "web-chat:*", level: "trusted" },
    ]);
    expect(bundledPermissions.entityActions?.["note"]?.create).toBe("trusted");

    const instance = resolve(
      definition,
      {},
      {
        bundles: ["core", "team"],
        permissions: {
          rules: [{ pattern: "instance:*", level: "public" }],
          entityActions: { note: { create: "public" } },
        },
      },
    );
    const instancePermissions = instance.permissions as PermissionConfig;

    expect(instancePermissions.rules).toEqual([
      { pattern: "instance:*", level: "public" },
    ]);
    expect(instancePermissions.entityActions?.["note"]?.create).toBe("public");
  });

  test("unions principal seeds and identical permission rules deterministically", () => {
    const definition = defineBrain({
      name: "principals",
      version: "1.0.0",
      capabilities: [["alpha", trackingFactory("alpha"), {}]],
      interfaces: [],
      permissions: { admins: ["definition-admin"] },
      bundles: [
        defineBundle({
          id: "core",
          members: ["alpha"],
          permissions: [
            {
              member: "alpha",
              config: {
                admins: ["core-admin"],
                rules: [{ pattern: "shared:*", level: "admin" }],
              },
            },
          ],
        }),
        defineBundle({
          id: "site",
          members: ["alpha"],
          permissions: [
            {
              member: "alpha",
              config: {
                trusted: ["site-trusted"],
                rules: [{ pattern: "shared:*", level: "admin" }],
              },
            },
          ],
        }),
      ],
    });

    const permissions = resolve(
      definition,
      {},
      {
        bundles: ["site", "core"],
      },
    ).permissions as PermissionConfig;

    expect(permissions.admins).toEqual(["definition-admin", "core-admin"]);
    expect(permissions.trusted).toEqual(["site-trusted"]);
    expect(permissions.rules).toEqual([
      { pattern: "shared:*", level: "admin" },
    ]);
  });

  test("rejects undeclared and invalid permission conflicts", () => {
    expect(() =>
      resolve(
        permissionDefinition(false),
        {},
        {
          bundles: ["core", "team"],
        },
      ),
    ).toThrow(/permission conflict.*web-chat:\*.*core.*team/i);

    const invalidConfigs: PluginConfig[] = [];
    const invalid = defineBrain({
      name: "invalid",
      version: "1.0.0",
      capabilities: [["alpha", trackingFactory("alpha", invalidConfigs), {}]],
      interfaces: [],
      bundles: [
        defineBundle({
          id: "core",
          members: ["alpha"],
          permissions: [
            {
              member: "alpha",
              config: {
                rules: [{ pattern: "invalid:*", level: "anchor" }],
              } as unknown as PermissionConfig,
            },
          ],
        }),
      ],
    });

    expect(() => resolve(invalid, {}, { bundles: ["core"] })).toThrow(
      /invalid permission contribution.*core/i,
    );
    expect(invalidConfigs).toEqual([]);
  });

  test("removal closes bundle config and permission contributions", () => {
    const definition = permissionDefinition();
    const config = resolve(
      definition,
      {},
      {
        bundles: ["core", "team"],
        remove: ["alpha"],
      },
    );
    const permissions = config.permissions as PermissionConfig;

    expect(pluginIds(config)).toEqual([]);
    expect(permissions.rules).toEqual([{ pattern: "mcp:*", level: "admin" }]);
    expect(permissions.entityActions?.["note"]?.create).toBe("admin");
  });
});
