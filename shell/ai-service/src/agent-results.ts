import { z } from "@brains/utils";
import {
  toolConfirmationSchema,
  toolResponseSchema,
  toolSuccessSchema,
} from "@brains/mcp-service";
import type {
  BrainAgentResult,
  PendingConfirmation,
  StructuredChatCard,
  ToolResultData,
} from "./agent-types";

const toolCallArgsSchema = z.record(z.unknown());
const jobIdSchema = z.object({ jobId: z.string() }).passthrough();
const attachmentToolDataSchema = z.object({
  documentId: z.string().min(1),
  attachment: z.object({
    mediaType: z.string().min(1),
    url: z.string().min(1),
    downloadUrl: z.string().min(1).optional(),
    previewUrl: z.string().min(1).optional(),
    filename: z.string().min(1).optional(),
    sizeBytes: z.number().nonnegative().optional(),
    source: z
      .object({
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        attachmentType: z.string().optional(),
      })
      .optional(),
  }),
});

export interface ExtractedResults {
  toolResults: ToolResultData[];
  pendingConfirmation: PendingConfirmation | null;
  pendingConfirmations: PendingConfirmation[];
  cards: StructuredChatCard[];
  totalToolCalls: number;
}

export function extractToolResults(
  steps: BrainAgentResult["steps"],
): ExtractedResults {
  const toolResults: ToolResultData[] = [];
  const cards: StructuredChatCard[] = [];
  const pendingConfirmations: PendingConfirmation[] = [];
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

      const confirmationParsed = toolConfirmationSchema.safeParse(tr.output);
      if (confirmationParsed.success) {
        const approvalId = tr.toolCallId
          ? `approval:${tr.toolCallId}`
          : `approval:${tr.toolName}:${totalToolCalls}`;
        const args = tr.toolCallId
          ? toolCallArgsMap.get(tr.toolCallId)
          : undefined;
        const confirmation: PendingConfirmation = {
          id: approvalId,
          ...(tr.toolCallId ? { toolCallId: tr.toolCallId } : {}),
          toolName: confirmationParsed.data.toolName,
          summary: confirmationParsed.data.summary,
          ...(confirmationParsed.data.preview !== undefined
            ? { preview: confirmationParsed.data.preview }
            : {}),
          args: confirmationParsed.data.args,
        };
        pendingConfirmation ??= confirmation;
        pendingConfirmations.push(confirmation);

        toolResults.push({
          toolName: tr.toolName,
          ...(args !== undefined ? { args } : {}),
        });
        cards.push({
          kind: "tool-approval",
          id: approvalId,
          ...(tr.toolCallId ? { toolCallId: tr.toolCallId } : {}),
          toolName: confirmationParsed.data.toolName,
          ...(args !== undefined ? { input: args } : {}),
          summary: confirmationParsed.data.summary,
          ...(confirmationParsed.data.preview !== undefined
            ? { preview: confirmationParsed.data.preview }
            : {}),
          state: "approval-requested",
        });
        continue;
      }

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

      const successParsed = toolSuccessSchema.safeParse(parsed.data);
      if (successParsed.success && successParsed.data.data != null) {
        toolResult.data = successParsed.data.data;
        const jobIdParsed = jobIdSchema.safeParse(successParsed.data.data);
        if (jobIdParsed.success) {
          toolResult.jobId = jobIdParsed.data.jobId;
        }
        const attachmentParsed = attachmentToolDataSchema.safeParse(
          successParsed.data.data,
        );
        if (attachmentParsed.success) {
          const attachment = attachmentParsed.data.attachment;
          const source = attachment.source;
          cards.push({
            kind: "attachment",
            id: `attachment:${attachmentParsed.data.documentId}`,
            title: attachment.filename ?? "Generated PDF document",
            description:
              "PDF generation has been queued. This artifact will open once the job completes.",
            attachment: {
              mediaType: attachment.mediaType,
              url: attachment.url,
              ...(attachment.downloadUrl !== undefined
                ? { downloadUrl: attachment.downloadUrl }
                : {}),
              ...(attachment.previewUrl !== undefined
                ? { previewUrl: attachment.previewUrl }
                : {}),
              ...(attachment.filename !== undefined
                ? { filename: attachment.filename }
                : {}),
              ...(attachment.sizeBytes !== undefined
                ? { sizeBytes: attachment.sizeBytes }
                : {}),
              ...(source !== undefined
                ? {
                    source: {
                      ...(source.entityType !== undefined
                        ? { entityType: source.entityType }
                        : {}),
                      ...(source.entityId !== undefined
                        ? { entityId: source.entityId }
                        : {}),
                      ...(source.attachmentType !== undefined
                        ? { attachmentType: source.attachmentType }
                        : {}),
                    },
                  }
                : {}),
            },
          });
        }
      }

      toolResults.push(toolResult);
    }
  }

  return {
    toolResults,
    pendingConfirmation,
    pendingConfirmations,
    cards,
    totalToolCalls,
  };
}
