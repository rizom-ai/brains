import { dynamicTool, type ToolSet } from "ai";
import { z } from "@brains/utils";
import type { Tool, ToolContext } from "@brains/mcp-service";
import type { UserPermissionLevel } from "@brains/templates";
import { createToolExecuteWrapper, type ToolEventEmitter } from "./tool-events";

export interface ToolContextInfo {
  conversationId: string;
  channelId?: string | undefined;
  channelName?: string | undefined;
  interfaceType: string;
  userPermissionLevel?: UserPermissionLevel;
}

const INTERNAL_CONFIRMATION_FIELDS = new Set([
  "confirmed",
  "confirmationToken",
  "contentHash",
]);

export function toModelVisibleInputSchema(
  inputSchema: Tool["inputSchema"],
): Tool["inputSchema"] {
  return Object.fromEntries(
    Object.entries(inputSchema).filter(
      ([key]) => !INTERNAL_CONFIRMATION_FIELDS.has(key),
    ),
  );
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
          conversationId: contextInfo.conversationId,
          channelId: contextInfo.channelId ?? contextInfo.conversationId,
          ...(contextInfo.channelName && {
            channelName: contextInfo.channelName,
          }),
          ...(contextInfo.userPermissionLevel && {
            userPermissionLevel: contextInfo.userPermissionLevel,
          }),
        };
        return t.handler(args, context);
      },
      contextInfo,
      emitter,
    );

    sdkTools[t.name] = dynamicTool({
      description: t.description,
      inputSchema: z.object(toModelVisibleInputSchema(t.inputSchema)),
      execute: wrappedExecute,
    });
  }

  return sdkTools;
}
