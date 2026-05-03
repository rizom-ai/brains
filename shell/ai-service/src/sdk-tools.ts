import { dynamicTool, type ToolSet } from "ai";
import { z } from "@brains/utils";
import type { Tool, ToolContext } from "@brains/mcp-service";
import { createToolExecuteWrapper, type ToolEventEmitter } from "./tool-events";

export interface ToolContextInfo {
  conversationId: string;
  channelId?: string | undefined;
  channelName?: string | undefined;
  interfaceType: string;
}

export function convertToSDKTools(
  pluginTools: Tool[],
  contextInfo: ToolContextInfo,
  emitter: ToolEventEmitter,
): ToolSet {
  const sdkTools: ToolSet = {};

  for (const t of pluginTools) {
    const wrappedExecute = createToolExecuteWrapper(
      t.name,
      async (args: unknown) => {
        const context: ToolContext = {
          interfaceType: contextInfo.interfaceType,
          userId: "agent-user",
          channelId: contextInfo.channelId ?? contextInfo.conversationId,
          ...(contextInfo.channelName && {
            channelName: contextInfo.channelName,
          }),
        };
        return t.handler(args, context);
      },
      contextInfo,
      emitter,
    );

    sdkTools[t.name] = dynamicTool({
      description: t.description,
      inputSchema: z.object(t.inputSchema),
      execute: wrappedExecute,
    });
  }

  return sdkTools;
}
