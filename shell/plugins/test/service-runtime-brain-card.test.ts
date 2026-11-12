import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  createServicePluginContext,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type Plugin,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class reads what the brain says
 * about itself as its class did through its context: the app's metadata,
 * whether this process serves the brain's HTTP surface, and the public
 * skills its card advertises. Atproto's brain card is built from them.
 */

async function runtimeOn(shell: MockShell): Promise<{
  runtime: ServiceRuntime;
  plugin: Plugin;
}> {
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
  await plugin.register(shell);
  if (!runtime) throw new Error("Setup did not run");
  return { runtime, plugin };
}

describe("a first-party service's reads of the brain's self-description", () => {
  it("reads the app's metadata and the public skills as its class did", async () => {
    const shell = createMockShell();
    const { runtime } = await runtimeOn(shell);
    const context = createServicePluginContext(shell, "probe");

    expect(await runtime.identity.getAppInfo()).toEqual(
      await context.identity.getAppInfo(),
    );
    expect(await runtime.publicSkills.list()).toEqual(
      await context.publicSkills.list(),
    );
  });

  it("knows whether this process serves the brain's HTTP surface", async () => {
    const plain = await runtimeOn(createMockShell());
    expect(plain.runtime.servesHttp).toBe(false);

    const web = createMockShell();
    web.serveHttp();
    expect((await runtimeOn(web)).runtime.servesHttp).toBe(true);
  });
});
