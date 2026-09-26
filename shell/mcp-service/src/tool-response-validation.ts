import type { MessageResponse } from "@brains/messaging-service";
import { SdkError, toSdkError, type SdkErrorCode } from "@brains/contracts";
import { type Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import {
  toolResponseSchema,
  type Tool,
  type ToolResponse,
  type ToolErrorResponse,
} from "./types";

interface ToolResponseValidationContext {
  pluginId: string;
  toolName: string;
  logger: Logger;
}

function invalidToolResponse(): ToolErrorResponse & { code: SdkErrorCode } {
  const failure = new SdkError("invalid_response");
  return { success: false, error: failure.message, code: failure.code };
}

/**
 * Envelope shape returned by message-bus handlers for `plugin:*:tool:execute`.
 * Success branch carries the raw tool response in `data`; error branch is the
 * bus-level failure (e.g. tool not found, payload invalid). Anything else
 * (missing `success`, `noop`, wrong types) is rejected by the union.
 */
const toolExecutionEnvelopeSchema = z.union([
  z.looseObject({ success: z.literal(true) }),
  z.object({
    success: z.literal(false),
    error: z.string(),
    code: z.string().optional(),
  }),
]);

function hasEnvelopeData(value: {
  success: true;
}): value is { success: true; data: unknown } {
  return Object.prototype.hasOwnProperty.call(value, "data");
}

export function normalizeToolResponse(
  raw: unknown,
  context: ToolResponseValidationContext,
): ToolResponse {
  const parsed = toolResponseSchema.safeParse(raw);

  if (
    parsed.success &&
    "success" in parsed.data &&
    parsed.data.success === true &&
    !Object.prototype.hasOwnProperty.call(parsed.data, "data")
  ) {
    context.logger.error("Tool returned non-compliant response", {
      pluginId: context.pluginId,
      toolName: context.toolName,
      issues: [{ path: ["data"], message: "Required" }],
    });
    return invalidToolResponse();
  }

  if (parsed.success) {
    // Explicit native/protocol responses own their domain refusal messages.
    // Runtime-generated failures are sanitized where the exception is caught.
    return parsed.data;
  }

  context.logger.error("Tool returned non-compliant response", {
    pluginId: context.pluginId,
    toolName: context.toolName,
    issueCodes: parsed.error.issues.map((issue) => issue.code),
  });

  return invalidToolResponse();
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
    });
    return invalidToolResponse();
  }

  if (!parsed.data.success) {
    const failure = toSdkError(parsed.data);
    return { success: false, error: failure.message, code: failure.code };
  }

  if (!hasEnvelopeData(parsed.data)) {
    context.logger.error("Tool returned non-compliant message response", {
      pluginId: context.pluginId,
      toolName: context.toolName,
    });
    return invalidToolResponse();
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
      let fallback: SdkErrorCode = "handler_failed";
      try {
        const raw = await tool.handler(input, context);
        fallback = "invalid_response";
        return normalizeToolResponse(raw, {
          pluginId,
          toolName: tool.name,
          logger,
        });
      } catch (error) {
        const failure = toSdkError(error, fallback);
        return { success: false, error: failure.message, code: failure.code };
      }
    },
  };
}
