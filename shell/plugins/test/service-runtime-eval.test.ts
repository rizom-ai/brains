import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
} from "../src";

/**
 * A first-party service converted from a class registers the eval handlers
 * its class registered, under its plugin id (`playbooks:goalCheck`), so the
 * plugin evals that name them keep running them. A worker registers none,
 * as a class's worker context did not.
 */

async function install(
  shell: MockShell,
  executionOnly = false,
): Promise<Map<string, (input: unknown) => Promise<unknown>>> {
  const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
  shell.registerEvalHandler = (pluginId, handlerId, handler): void => {
    handlers.set(`${pluginId}:${handlerId}`, handler);
  };
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin(
      { id: "playbooks", config: z.object({}) },
      {
        subscriptions: (context) => {
          serviceRuntime(context).evalHandler("goalCheck", async (input) => ({
            judged: input,
          }));
          return [];
        },
      },
    ),
    {},
    { name: "@brains/playbooks", version: "0.1.0" },
    { pluginId: "playbooks" },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(shell, { executionOnly });
  return handlers;
}

describe("a first-party service's eval handlers", () => {
  it("are registered under the plugin's id", async () => {
    const handlers = await install(createMockShell());
    const handler = handlers.get("playbooks:goalCheck");
    if (!handler) throw new Error("playbooks:goalCheck was not registered");
    expect(await handler({ goal: ["x"] })).toEqual({
      judged: { goal: ["x"] },
    });
  });

  it("are not registered in a worker", async () => {
    expect([...(await install(createMockShell(), true)).keys()]).toEqual([]);
  });
});
