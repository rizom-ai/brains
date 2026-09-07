import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "../src";
import { createPluginHarness } from "../src/test/harness";
import { createMockShell } from "../src/test/mock-shell";

/** A service reporting one check always and a second only when configured. */
function instantiate(config: { git: boolean }): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "directory-sync",
      config: z.object({ git: z.boolean().default(false) }),
      health: ({ config }) => ({
        "git-progress": (): { status: "healthy" } => ({ status: "healthy" }),
        ...(config.git
          ? {
              "git-broker": (): { status: "degraded"; message: string } => ({
                status: "degraded",
                message: "The checkout owner has not reported progress",
              }),
            }
          : {}),
      }),
    }),
    config,
    { name: "@fixture/directory-sync", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Service plugin was not created");
  return plugin;
}

/**
 * Health a declared service reports, as a declaration rather than a
 * registration: named providers, a function of config and state, which the
 * runtime registers once registration completes in the scheduling role and
 * releases on shutdown. Named consumer: @brains/directory-sync.
 */
describe("health a declared service reports", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("health-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  it("registers the declared checks under the package's id", async () => {
    const plugin = instantiate({ git: true });

    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();

    const checks = await harness
      .getMockShell()
      .getOperationalHealthRegistry()
      .getChecks();
    expect(checks).toEqual([
      {
        name: `${plugin.id}:git-broker`,
        status: "degraded",
        message: "The checkout owner has not reported progress",
      },
      { name: `${plugin.id}:git-progress`, status: "healthy" },
    ]);
  });

  it("declares only what the configuration calls for", async () => {
    const plugin = instantiate({ git: false });

    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();

    const checks = await harness
      .getMockShell()
      .getOperationalHealthRegistry()
      .getChecks();
    expect(checks.map((check) => check.name)).toEqual([
      `${plugin.id}:git-progress`,
    ]);
  });

  it("releases the checks when the service shuts down", async () => {
    const shell = createMockShell({
      logger: createSilentLogger("health-test"),
    });
    const plugin = instantiate({ git: true });
    await plugin.register(shell);
    if (plugin.finalizeRegistration) await plugin.finalizeRegistration();
    expect(await shell.getOperationalHealthRegistry().getChecks()).toHaveLength(
      2,
    );

    if (plugin.shutdown) await plugin.shutdown();

    expect(await shell.getOperationalHealthRegistry().getChecks()).toEqual([]);
  });

  it("reports nothing from a worker", async () => {
    const shell = createMockShell({
      logger: createSilentLogger("health-test"),
    });
    const plugin = instantiate({ git: true });

    await plugin.register(shell, { executionOnly: true });
    if (plugin.finalizeRegistration) await plugin.finalizeRegistration();

    expect(await shell.getOperationalHealthRegistry().getChecks()).toEqual([]);
    if (plugin.shutdown) await plugin.shutdown();
  });
});
