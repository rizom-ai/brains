import type { AgentResponse } from "@brains/contracts";
import type { ToolResponse } from "@brains/mcp-service";

export function agentResponseToToolResponse(
  response: AgentResponse,
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
        ...(confirmation.toolCallId
          ? { toolCallId: confirmation.toolCallId }
          : {}),
        originalArgs: confirmation.args,
      },
    };
  }

  return {
    success: true,
    data: {
      text: response.text,
      ...(response.toolResults ? { toolResults: response.toolResults } : {}),
    },
  };
}
