import type { MessageResponse } from "@brains/messaging-service";
import { z } from "@brains/utils";
import { type Logger } from "@brains/utils/logger";
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

/**
 * Envelope shape returned by message-bus handlers for `plugin:*:tool:execute`.
 * Success branch carries the raw tool response in `data`; error branch is the
 * bus-level failure (e.g. tool not found, payload invalid). Anything else
 * (missing `success`, `noop`, wrong types) is rejected by the union.
 */
const toolExecutionEnvelopeSchema = z.union([
  z
    .object({ success: z.literal(true), data: z.unknown() })
    .superRefine((value, ctx) => {
      if (!Object.prototype.hasOwnProperty.call(value, "data")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data"],
          message: "Required",
        });
      }
    }),
  z.object({ success: z.literal(false), error: z.string() }),
]);

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
  const parsed = toolExecutionEnvelopeSchema.safeParse(response);

  if (!parsed.success) {
    context.logger.error("Tool returned non-compliant message response", {
      pluginId: context.pluginId,
      toolName: context.toolName,
      response,
    });
    return invalidEnvelopeResponse(context.toolName);
  }

  if (!parsed.data.success) {
    return { success: false, error: parsed.data.error };
  }

  return {
    success: true,
    data: normalizeToolResponse(parsed.data.data, context),
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
