import { describe, expect, it } from "bun:test";
import { PLUGIN_CHANNELS } from "@brains/contracts";
import type { ProgressNotification } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  withTools,
} from "../src";
import type { Plugin, Tool, ToolResponse } from "../src/interfaces";
import { createPluginHarness } from "../src/test/harness";

/** A declared service whose one tool reports progress. */
function progressService(): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    withTools(
      defineServicePlugin({
        id: "progress-test",
        config: z.object({}),
        setup: () => ({}),
      }),
      (): Tool[] => [
        {
          name: "progress_tool",
          description: "Reports progress",
          inputSchema: {},
          visibility: "public",
          handler: async (_input, context): Promise<ToolResponse> => {
            await context.sendProgress?.({ progress: 1, total: 2 });
            return { success: true, message: "Done" };
          },
        },
      ],
    ),
    {},
    { name: "@fixture/progress-test", version: "1.0.0" },
  );
  if (!plugin) throw new Error("No progress service");
  return plugin;
}

describe("tool execution progress", () => {
  it("reports a tool's progress to the caller that asked for it", async () => {
    const harness = createPluginHarness();
    const plugin = progressService();
    await harness.installPlugin(plugin);
    const reported: ProgressNotification[] = [];

    await harness.sendMessage(
      PLUGIN_CHANNELS.toolExecute(plugin.id),
      {
        toolName: "progress_tool",
        args: {},
        progressToken: "token-1",
        interfaceType: "mcp",
        actor: { kind: "user", userId: "usr_reader" },
        sendProgress: async (notification: ProgressNotification) => {
          reported.push(notification);
        },
      },
      "MCPService",
    );

    expect(reported).toEqual([{ progress: 1, total: 2 }]);
  });
});
