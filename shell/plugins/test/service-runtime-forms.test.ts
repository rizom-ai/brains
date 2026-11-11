import { describe, expect, it, spyOn } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  createMockShell,
  type MockShell,
  type MockShellOptions,
} from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type Plugin,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class reads and registers what
 * the forms engine's service class did through its context: the brain's
 * theme stylesheet for the pages it serves, whether another plugin is
 * installed, the URL it advertises, and the health it reports.
 */

async function runtimeOn(
  shell: MockShell,
  executionOnly = false,
): Promise<{ runtime: ServiceRuntime; plugin: Plugin }> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "probe",
      config: z.object({}),
      setup: (context) => {
        runtime = serviceRuntime(context);
        return {};
      },
    }),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(
    shell,
    executionOnly ? { executionOnly: true } : undefined,
  );
  if (!runtime) throw new Error("Setup did not run");
  return { runtime, plugin };
}

function shellWith(options: MockShellOptions = {}): MockShell {
  return createMockShell(options);
}

describe("a first-party service's forms-engine reads and registrations", () => {
  it("reads the brain's theme stylesheet, as its class read context.themeCSS", async () => {
    const { runtime } = await runtimeOn(
      shellWith({ themeCSS: ":root { --color: red; }" }),
    );
    expect(runtime.themeCSS).toBe(":root { --color: red; }");
  });

  it("says whether a plugin is installed, as its class read context.plugins.has", async () => {
    const shell = shellWith();
    spyOn(shell, "getPluginPackageName").mockImplementation((id) =>
      id === "unified-inbox" ? "@brains/unified-inbox" : undefined,
    );
    const { runtime } = await runtimeOn(shell);
    expect(runtime.hasPlugin("unified-inbox")).toBe(true);
    expect(runtime.hasPlugin("studio")).toBe(false);
  });
});
