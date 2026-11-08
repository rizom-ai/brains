import { describe, expect, it } from "bun:test";
import { PLUGIN_CHANNELS } from "@brains/contracts";
import type { ProgressNotification } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import type { Tool, ToolResponse } from "../src/interfaces";
import { ServicePlugin } from "../src/service/service-plugin";
import { createPluginHarness } from "../src/test/harness";

class ProgressPlugin extends ServicePlugin<
  Record<string, never>,
  Record<string, never>
> {
  constructor() {
    super(
      "progress-test",
      { name: "progress-test", version: "1.0.0" },
      {},
      z.object({}),
    );
  }

  protected override async getTools(): Promise<Tool[]> {
    return [
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
    ];
  }
}

describe("tool execution progress", () => {
  it("reports a tool's progress to the caller that asked for it", async () => {
    const harness = createPluginHarness();
    await harness.installPlugin(new ProgressPlugin());
    const reported: ProgressNotification[] = [];

    await harness.sendMessage(
      PLUGIN_CHANNELS.toolExecute("progress-test"),
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
