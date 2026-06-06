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
  enableCreateUpload?: boolean | undefined;
  enableCreateTransform?: boolean | undefined;
  enableCreateSourceAttachment?: boolean | undefined;
}

const INTERNAL_CONFIRMATION_FIELDS = new Set([
  "confirmed",
  "confirmationToken",
  "contentHash",
]);

const CREATE_SOURCE_FIELDS = new Set([
  "upload",
  "transform",
  "sourceAttachment",
]);

export function toModelVisibleInputSchema(
  inputSchema: Tool["inputSchema"],
  options: {
    toolName?: string;
    enableCreateUpload?: boolean;
    enableCreateTransform?: boolean;
    enableCreateSourceAttachment?: boolean;
  } = {},
): Tool["inputSchema"] {
  return Object.fromEntries(
    Object.entries(inputSchema).filter(([key]) => {
      if (INTERNAL_CONFIRMATION_FIELDS.has(key)) return false;
      if (options.toolName !== "system_create") return true;
      if (!CREATE_SOURCE_FIELDS.has(key)) return true;
      if (key === "upload") return options.enableCreateUpload === true;
      if (key === "transform") return options.enableCreateTransform === true;
      return options.enableCreateSourceAttachment === true;
    }),
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
      inputSchema: z.object(
        toModelVisibleInputSchema(t.inputSchema, {
          toolName: t.name,
          ...(contextInfo.enableCreateUpload !== undefined && {
            enableCreateUpload: contextInfo.enableCreateUpload,
          }),
          ...(contextInfo.enableCreateTransform !== undefined && {
            enableCreateTransform: contextInfo.enableCreateTransform,
          }),
          ...(contextInfo.enableCreateSourceAttachment !== undefined && {
            enableCreateSourceAttachment:
              contextInfo.enableCreateSourceAttachment,
          }),
        }),
      ),
      execute: wrappedExecute,
    });
  }

  return sdkTools;
}
