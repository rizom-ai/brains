import { afterEach, expect, test } from "bun:test";
import { PLUGIN_CHANNELS } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  withTools,
} from "../src";
import type { Plugin, Tool } from "../src/interfaces";
import { createPluginHarness } from "../test";

/**
 * A service whose tool keeps state between calls, as a confirmation-gated
 * tool keeps its pending confirmations: each build of the tools starts it
 * afresh.
 */
function countingService(): { plugin: Plugin; builds: { count: number } } {
  const builds = { count: 0 };
  const [plugin] = instantiatePluginPackageDefinition(
    withTools(
      defineServicePlugin({
        id: "counting",
        config: z.object({}),
        setup: () => ({}),
      }),
      (): Tool[] => {
        builds.count += 1;
        let calls = 0;
        return [
          {
            name: "counting_next",
            description: "Count this call.",
            inputSchema: {},
            visibility: "public",
            handler: async (): Promise<{
              success: true;
              data: { calls: number };
            }> => {
              calls += 1;
              return { success: true, data: { calls } };
            },
          },
        ];
      },
    ),
    {},
    { name: "@fixture/counting", version: "1.0.0" },
  );
  if (!plugin) throw new Error("No counting service");
  return { plugin, builds };
}

const harness = createPluginHarness();

afterEach(async () => {
  await harness.reset();
});

function callOverTheBus(plugin: Plugin): Promise<unknown> {
  return harness
    .getMockShell()
    .getMessageBus()
    .send({
      type: PLUGIN_CHANNELS.toolExecute(plugin.id),
      payload: {
        toolName: "counting_next",
        args: {},
        interfaceType: "mcp",
        actor: { kind: "service", serviceId: "mcp-test" },
      },
      sender: "mcp",
    });
}

test("registering again builds the tools again, against the new registration", async () => {
  const { plugin, builds } = countingService();
  await harness.installPlugin(plugin);
  await callOverTheBus(plugin);
  await harness.reset();

  await harness.installPlugin(plugin);

  expect(await callOverTheBus(plugin)).toMatchObject({
    success: true,
    data: { success: true, data: { calls: 1 } },
  });
  expect(builds.count).toBe(2);
});

test("a tool called over the bus is the instance the plugin registered", async () => {
  const { plugin, builds } = countingService();
  await harness.installPlugin(plugin);

  expect(await callOverTheBus(plugin)).toMatchObject({
    success: true,
    data: { success: true, data: { calls: 1 } },
  });
  expect(await callOverTheBus(plugin)).toMatchObject({
    success: true,
    data: { success: true, data: { calls: 2 } },
  });
  expect(builds.count).toBe(1);
});
