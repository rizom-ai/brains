import { describe, expect, it } from "bun:test";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  SYSTEM_CHANNELS,
  type Plugin,
} from "@brains/plugins";
import {
  createPluginHarness,
  expectTemplateDataSourcesResolve,
} from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import socialMediaPackage from "../src";
import packageJson from "../package.json";

const PACKAGE_METADATA = {
  name: packageJson.name,
  version: packageJson.version,
};

function instantiate(config: object = {}): Plugin[] {
  bindPluginPackageMetadata(socialMediaPackage, PACKAGE_METADATA);
  return instantiatePluginPackageDefinition(
    socialMediaPackage,
    config,
    PACKAGE_METADATA,
  );
}

function entityPlugin(config: object = {}): Plugin {
  const plugin = instantiate(config).find(({ type }) => type === "entity");
  if (!plugin) throw new Error("Social post entity plugin was not created");
  return plugin;
}

describe("social media package", () => {
  it("produces a service plugin for publishing and an entity plugin for storage", () => {
    const plugins = instantiate();

    expect(plugins.map((plugin) => plugin.type)).toEqual(["service", "entity"]);
    expect(plugins.map((plugin) => plugin.id)).toEqual([
      `${packageJson.name}:publishing`,
      `${packageJson.name}:social-post`,
    ]);
  });

  it("registers the entity type, its templates, and its data source", async () => {
    const harness = createPluginHarness({
      logger: createSilentLogger("social-package-test"),
    });
    await harness.installPlugin(entityPlugin());

    expect(harness.getEntityService().getEntityTypes()).toContain(
      "social-post",
    );
    expectTemplateDataSourcesResolve(harness);

    harness.reset();
  });

  it("registers social posts as secondary topic sources", async () => {
    const harness = createPluginHarness({
      logger: createSilentLogger("social-config-test"),
    });
    await harness.installPlugin(entityPlugin());

    expect(
      harness.getEntityRegistry().getEntityTypeConfig("social-post"),
    ).toMatchObject({ projectionSourceRole: "secondary" });

    harness.reset();
  });

  it("registers its atproto projection and releases it on shutdown", async () => {
    AtprotoProjectionRegistry.resetInstance();
    const plugin = entityPlugin();
    const harness = createPluginHarness({
      logger: createSilentLogger("social-atproto-test"),
    });
    await harness.installPlugin(plugin);

    expect(
      AtprotoProjectionRegistry.getInstance().get("social-post"),
    ).toBeDefined();

    await plugin.shutdown?.();
    expect(
      AtprotoProjectionRegistry.getInstance().get("social-post"),
    ).toBeUndefined();

    harness.reset();
  });

  // The provider reaches LinkedIn, so it exists only when this brain has
  // credentials for it.
  describe("publishing", () => {
    async function registrations(config: object): Promise<unknown[]> {
      const harness = createPluginHarness({
        logger: createSilentLogger("social-publish-test"),
      });
      const registered: unknown[] = [];
      harness.subscribe("publish:register", async (msg) => {
        registered.push(msg.payload);
        return { success: true };
      });
      for (const plugin of instantiate(config)) {
        await harness.installPlugin(plugin);
      }
      await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {});
      harness.reset();
      return registered;
    }

    it("announces LinkedIn once credentials are configured", async () => {
      const registered = await registrations({
        linkedin: { accessToken: "token-1" },
      });

      expect(registered).toEqual([
        {
          entityType: "social-post",
          provider: expect.objectContaining({ name: "linkedin" }),
          config: { publishResultIdField: "platformPostId" },
        },
      ]);
    });

    it("announces nothing without credentials", async () => {
      expect(await registrations({})).toEqual([]);
    });
  });
});
