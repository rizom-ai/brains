import { describe, expect, it } from "bun:test";
import {
  canonicalAtprotoLexicons,
  type AtprotoProjection,
} from "@brains/atproto-contracts";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type Plugin,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class reads the AT Protocol
 * projections entity packages registered as its class did through
 * context.atprotoProjections: a type's newest projection, none for a type
 * that registered none. Atproto publishes a projected entity through it.
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

describe("a first-party service's AT Protocol projections", () => {
  it("reads the projection an entity package registered, newest first", async () => {
    const shell = createMockShell();
    const registry = shell.getAtprotoProjectionRegistry();
    const projection: AtprotoProjection = {
      entityType: "post",
      collection: "ai.rizom.brain.card",
      lexicon: canonicalAtprotoLexicons["ai.rizom.brain.card"],
      buildRecord: async () => ({ text: "A post" }),
    };
    registry.register(projection);
    const { runtime } = await runtimeOn(shell);

    expect(runtime.atprotoProjections.get("post")).toBe(registry.get("post"));
    expect(runtime.atprotoProjections.get("note")).toBeUndefined();
  });
});
