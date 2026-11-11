import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineServicePlugin,
  firstPartyTool,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party tool converted from a class reads what its class's handler
 * read from the call: the conversation it was called in and the caller's
 * permission level. Outside a tool call there is none.
 */

describe("a first-party tool's call", () => {
  it("is the running call's conversation and permission level", async () => {
    let runtime: ServiceRuntime | undefined;
    const service = defineServicePlugin(
      { id: "probe", config: z.object({}) },
      {
        tools: (context) => {
          const reached = serviceRuntime(context);
          runtime = reached;
          return [
            firstPartyTool({
              name: "where",
              description: "Where the call came from.",
              input: z.object({}),
              output: z.object({
                conversationId: z.string().optional(),
                userPermissionLevel: z.string().optional(),
              }),
              execute: () => {
                const call = reached.toolCall();
                return {
                  ...(call?.conversationId !== undefined && {
                    conversationId: call.conversationId,
                  }),
                  ...(call?.userPermissionLevel !== undefined && {
                    userPermissionLevel: call.userPermissionLevel,
                  }),
                };
              },
            }),
          ];
        },
      },
    );
    const plugins = instantiatePluginPackageDefinition(
      service,
      {},
      { name: "@brains/probe", version: "0.1.0" },
      { pluginId: "probe" },
    );
    const harness = createPluginHarness({ logger: createSilentLogger() });
    for (const plugin of plugins) await harness.installPlugin(plugin);
    const tool = harness
      .getCapabilities()
      .tools.find(({ name }) => name === "probe_where");
    if (!tool) throw new Error("probe_where was not registered");

    expect(
      await tool.handler(
        {},
        {
          interfaceType: "web-chat",
          actor: { kind: "user", userId: "trusted-user" },
          conversationId: "conversation-1",
          userPermissionLevel: "trusted",
        },
      ),
    ).toEqual({
      success: true,
      data: {
        conversationId: "conversation-1",
        userPermissionLevel: "trusted",
      },
    });
    expect(
      await tool.handler(
        {},
        { interfaceType: "cli", actor: { kind: "user", userId: "cli" } },
      ),
    ).toEqual({ success: true, data: {} });
    if (!runtime) throw new Error("No runtime");
    expect(runtime.toolCall()).toBeUndefined();
    await harness.reset();
  });
});
