import { afterEach, expect, test } from "bun:test";
import { PLUGIN_CHANNELS } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { ServicePlugin } from "../src/service/service-plugin";
import type { Tool } from "../src/interfaces";
import { createPluginHarness } from "../test";

/**
 * A tool that keeps state between calls, as a confirmation-gated tool keeps
 * its pending confirmations: each build of the tools starts it afresh.
 */
class CountingPlugin extends ServicePlugin<
  Record<string, never>,
  Record<string, never>
> {
  public builds = 0;

  constructor() {
    super("counting", { name: "counting", version: "1.0.0" }, {}, z.object({}));
  }

  protected override async getTools(): Promise<Tool[]> {
    this.builds += 1;
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
  }
}

const harness = createPluginHarness();

afterEach(async () => {
  await harness.reset();
});

function callOverTheBus(): Promise<unknown> {
  return harness
    .getMockShell()
    .getMessageBus()
    .send({
      type: PLUGIN_CHANNELS.toolExecute("counting"),
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
  const plugin = new CountingPlugin();
  await harness.installPlugin(plugin);
  await callOverTheBus();
  await harness.reset();

  await harness.installPlugin(plugin);

  expect(await callOverTheBus()).toMatchObject({
    success: true,
    data: { success: true, data: { calls: 1 } },
  });
  expect(plugin.builds).toBe(2);
});

test("a tool called over the bus is the instance the plugin registered", async () => {
  const plugin = new CountingPlugin();
  await harness.installPlugin(plugin);

  expect(await callOverTheBus()).toMatchObject({
    success: true,
    data: { success: true, data: { calls: 1 } },
  });
  expect(await callOverTheBus()).toMatchObject({
    success: true,
    data: { success: true, data: { calls: 2 } },
  });
  expect(plugin.builds).toBe(1);
});
