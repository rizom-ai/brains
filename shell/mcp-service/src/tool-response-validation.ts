import type { MessageResponse } from "@brains/messaging-service";
import type { Logger } from "@brains/utils";
import { toolResponseSchema, type Tool, type ToolResponse } from "./types";

interface ToolResponseValidationContext {
  pluginId: string;
  toolName: string;
  logger: Logger;
}

function invalidToolResponse(toolName: string): ToolResponse {
  return {
    success: false,
    error: `Tool ${toolName} returned an invalid response shape`,
  };
}

function invalidEnvelopeResponse(
  toolName: string,
): MessageResponse<ToolResponse> {
  return {
    success: false,
    error: `Tool ${toolName} returned an invalid message response envelope`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeToolResponse(
  raw: unknown,
  context: ToolResponseValidationContext,
): ToolResponse {
  const parsed = toolResponseSchema.safeParse(raw);

  if (parsed.success) {
    return parsed.data;
  }

  context.logger.error("Tool returned non-compliant response", {
    pluginId: context.pluginId,
    toolName: context.toolName,
    issues: parsed.error.issues,
  });

  return invalidToolResponse(context.toolName);
}

export function normalizeToolExecutionMessageResponse(
  response: unknown,
  context: ToolResponseValidationContext,
): MessageResponse<ToolResponse> {
  if (!isRecord(response)) {
    context.logger.error("Tool returned non-compliant message response", {
      pluginId: context.pluginId,
      toolName: context.toolName,
      response,
    });
    return invalidEnvelopeResponse(context.toolName);
  }

  if ("noop" in response) {
    context.logger.error("Tool returned no message response", {
      pluginId: context.pluginId,
      toolName: context.toolName,
    });
    return invalidEnvelopeResponse(context.toolName);
  }

  if (response["success"] === false) {
    if (typeof response["error"] === "string") {
      return {
        success: false,
        error: response["error"],
      };
    }

    context.logger.error("Tool returned non-compliant message response", {
      pluginId: context.pluginId,
      toolName: context.toolName,
      response,
    });
    return invalidEnvelopeResponse(context.toolName);
  }

  if (
    response["success"] !== true ||
    !Object.prototype.hasOwnProperty.call(response, "data")
  ) {
    context.logger.error("Tool returned non-compliant message response", {
      pluginId: context.pluginId,
      toolName: context.toolName,
      response,
    });
    return invalidEnvelopeResponse(context.toolName);
  }

  return {
    success: true,
    data: normalizeToolResponse(response["data"], context),
  };
}

export function wrapToolWithResponseValidation(
  pluginId: string,
  tool: Tool,
  logger: Logger,
): Tool {
  return {
    ...tool,
    handler: async (input, context): Promise<ToolResponse> => {
      const raw = await tool.handler(input, context);
      return normalizeToolResponse(raw, {
        pluginId,
        toolName: tool.name,
        logger,
      });
    },
  };
}
