import type { AgentResponse, ToolResultData } from "@brains/contracts";
import type { ToolResponse } from "@brains/mcp-service";

interface ReadYourWritesHandle {
  toolName: string;
  entityType?: string;
  entityId?: string;
  jobId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringProperty(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getReadYourWritesHandle(
  toolResult: ToolResultData,
): ReadYourWritesHandle | undefined {
  const data = isRecord(toolResult.data) ? toolResult.data : undefined;
  const args = toolResult.args;
  const entityId =
    getStringProperty(data, "entityId") ?? getStringProperty(data, "id");
  const jobId = toolResult.jobId ?? getStringProperty(data, "jobId");
  const entityType =
    getStringProperty(args, "entityType") ?? getStringProperty(args, "type");

  if (!entityId && !jobId) {
    return undefined;
  }

  return {
    toolName: toolResult.toolName,
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(jobId ? { jobId } : {}),
  };
}

function getReadYourWritesHandles(
  toolResults: ToolResultData[] | undefined,
): ReadYourWritesHandle[] {
  return (
    toolResults
      ?.map(getReadYourWritesHandle)
      .filter(
        (handle): handle is ReadYourWritesHandle => handle !== undefined,
      ) ?? []
  );
}

export function agentResponseToToolResponse(
  response: AgentResponse,
  options: { conversationId?: string } = {},
): ToolResponse {
  const confirmation = response.pendingConfirmations?.[0];
  if (confirmation) {
    return {
      needsConfirmation: true,
      toolName: confirmation.toolName,
      summary: confirmation.summary,
      ...(confirmation.completionSummary
        ? { completionSummary: confirmation.completionSummary }
        : {}),
      ...(confirmation.preview ? { preview: confirmation.preview } : {}),
      args: {
        approvalId: confirmation.id,
        ...(options.conversationId
          ? { conversationId: options.conversationId }
          : {}),
        ...(confirmation.toolCallId
          ? { toolCallId: confirmation.toolCallId }
          : {}),
        originalArgs: confirmation.args,
      },
    };
  }

  const readYourWrites = getReadYourWritesHandles(response.toolResults);

  return {
    success: true,
    data: {
      text: response.text,
      ...(response.toolResults ? { toolResults: response.toolResults } : {}),
      ...(readYourWrites.length > 0 ? { readYourWrites } : {}),
    },
  };
}
