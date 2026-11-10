import { describe, expect, it } from "bun:test";
import { EntityRegistry } from "@brains/entity-service";
import {
  FatalPluginConfigurationError,
  PluginManager,
  type Plugin,
} from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import {
  initializeConfiguredPlugins,
  registerBrainCharacterSupport,
} from "../src/initialization/shell-registration";

describe("shell entity registration", () => {
  it("registers brain-character as excluded from derived projections", () => {
    const registry = EntityRegistry.createFresh(createSilentLogger());

    registerBrainCharacterSupport(registry, createSilentLogger());

    expect(registry.getEntityTypeConfig("brain-character")).toMatchObject({
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
  });
});

describe("configured plugin initialization", () => {
  function failingInterface(error: Error): Plugin {
    return {
      id: "failing-interface",
      packageName: "@test/failing-interface",
      version: "1.0.0",
      type: "interface",
      requiresDaemonStartup: () => false,
      register: async (): Promise<never> => {
        throw error;
      },
    };
  }

  async function initialize(plugin: Plugin): Promise<PluginManager> {
    const shell = createMockShell({ logger: createSilentLogger() });
    const pluginManager = PluginManager.createFresh(
      createSilentLogger(),
      shell.getDaemonRegistry(),
    );
    pluginManager.setShell(shell);
    await initializeConfiguredPlugins({
      plugins: [plugin],
      pluginManager,
      logger: createSilentLogger(),
      initOptions: undefined,
    });
    return pluginManager;
  }

  it("fails the boot on a fatal configuration error from a plugin whose daemon is optional", async () => {
    const fatal = new FatalPluginConfigurationError(
      "failing-interface",
      "this setting is refused here",
    );

    return expect(initialize(failingInterface(fatal))).rejects.toBe(fatal);
  });

  it("only records an ordinary registration error from a plugin whose daemon is optional", async () => {
    const ordinary = new Error("ordinary registration failure");

    const pluginManager = await initialize(failingInterface(ordinary));

    expect(pluginManager.getFailedPlugins()).toEqual([
      { id: "failing-interface", error: ordinary },
    ]);
  });
});
