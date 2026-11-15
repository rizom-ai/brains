import { describe, expect, it, spyOn } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class registers its agent
 * instructions again when what they say changes, as its class did through
 * context.registerInstructions: site-builder\x27s name the site\x27s title,
 * and they follow the site\x27s metadata.
 */

describe("a first-party service's instructions", () => {
  it("registers them again under the plugin's id", async () => {
    const shell = createMockShell();
    const registered: Array<[string, string]> = [];
    spyOn(shell, "registerInstructions").mockImplementation(
      (pluginId, instructions) => {
        registered.push([pluginId, instructions]);
      },
    );
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
    await plugin?.register(shell);
    if (!runtime) throw new Error("Setup did not run");

    runtime.instructions("## Your Site\n**Title:** Renamed");
    expect(registered).toEqual([["probe", "## Your Site\n**Title:** Renamed"]]);
  });
});
