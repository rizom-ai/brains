import { z } from "@brains/utils";
import {
  toolConfirmationSchema,
  toolResponseSchema,
  toolSuccessSchema,
} from "@brains/mcp-service";
import type {
  BrainAgentResult,
  PendingConfirmation,
  ToolResultData,
} from "./agent-types";

const toolCallArgsSchema = z.record(z.unknown());
const jobIdSchema = z.object({ jobId: z.string() }).passthrough();

/**
 * Result of extracting tool results from agent steps.
 * Includes both the tool results and any confirmation request found.
 */
export interface ExtractedResults {
  toolResults: ToolResultData[];
  pendingConfirmation: PendingConfirmation | null;
  totalToolCalls: number;
}

/**
 * Extract tool results and confirmation requests from agent generation steps.
 * Pure function — no side effects.
 *
 * If any tool returned a `needsConfirmation` response, it's surfaced
 * as `pendingConfirmation` so the machine can transition to awaitingConfirmation.
 */
export function extractToolResults(
  steps: BrainAgentResult["steps"],
): ExtractedResults {
  const toolResults: ToolResultData[] = [];
  let pendingConfirmation: PendingConfirmation | null = null;
  let totalToolCalls = 0;

  for (const step of steps) {
    totalToolCalls += step.toolCalls.length;
    const toolCallArgsMap = new Map<string, Record<string, unknown>>();
    for (const tc of step.toolCalls) {
      if (tc.toolCallId) {
        const parsed = toolCallArgsSchema.safeParse(tc.input);
        if (parsed.success) {
          toolCallArgsMap.set(tc.toolCallId, parsed.data);
        }
      }
    }

    for (const tr of step.toolResults) {
      if (tr.output === null) continue;

      // Check for confirmation request first
      const confirmationParsed = toolConfirmationSchema.safeParse(tr.output);
      if (confirmationParsed.success) {
        pendingConfirmation = {
          toolName: confirmationParsed.data.toolName,
          description: confirmationParsed.data.description,
          args: confirmationParsed.data.args,
        };
        continue;
      }

      // Parse as regular tool response
      const parsed = toolResponseSchema.safeParse(tr.output);
      if (!parsed.success) {
        toolResults.push({ toolName: tr.toolName });
        continue;
      }

      const args = tr.toolCallId
        ? toolCallArgsMap.get(tr.toolCallId)
        : undefined;

      const toolResult: ToolResultData = { toolName: tr.toolName };
      if (args !== undefined) {
        toolResult.args = args;
      }

      // Extract data and jobId from success responses
      const successParsed = toolSuccessSchema.safeParse(parsed.data);
      if (successParsed.success && successParsed.data.data != null) {
        toolResult.data = successParsed.data.data;
        const jobIdParsed = jobIdSchema.safeParse(successParsed.data.data);
        if (jobIdParsed.success) {
          toolResult.jobId = jobIdParsed.data.jobId;
        }
      }

      toolResults.push(toolResult);
    }
  }

  return { toolResults, pendingConfirmation, totalToolCalls };
}
