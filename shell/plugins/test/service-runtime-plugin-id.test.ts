import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type PluginPackageInstantiationOptions,
} from "../src";

/**
 * A first-party service converted from a class reads the plugin id it was
 * installed under, as its class read this.id: the legacy id the composer
 * names, or the package-scoped one without it. Newsletter's providers name
 * it in the site's signup slot and the form's action, which the HTTP host
 * mounts under it.
 */

async function installedId(
  options: PluginPackageInstantiationOptions,
): Promise<string | undefined> {
  let pluginId: string | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "buttondown",
      config: z.object({}),
      setup: (context) => {
        pluginId = serviceRuntime(context).pluginId;
        return {};
      },
    }),
    {},
    { name: "@brains/newsletter", version: "0.1.0" },
    options,
  );
  await plugin?.register(createMockShell());
  expect(pluginId).toBe(plugin?.id);
  return pluginId;
}

describe("a first-party service's plugin id", () => {
  it("is the legacy id the composer names, as its class's this.id was", async () => {
    expect(await installedId({ pluginId: "buttondown" })).toBe("buttondown");
  });

  it("is the package-scoped id without one", async () => {
    expect(await installedId({})).toBe("@brains/newsletter:buttondown");
  });
});
