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
const attachmentToolDataSchema = z
  .object({
    documentId: z.string().min(1).optional(),
    entityId: z.string().min(1).optional(),
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
  })
  .refine(
    (data) => data.documentId !== undefined || data.entityId !== undefined,
  );

/** Human-readable noun for an attachment's media type, for card copy. */
function describeAttachmentMedia(mediaType: string): string {
  if (mediaType === "application/pdf") return "PDF";
  const [type, subtype] = mediaType.split("/");
  if (type === "image") return "image";
  if (subtype) return subtype.toUpperCase();
  return "artifact";
}

export function buildAttachmentCardFromToolData(
  data: unknown,
): StructuredChatCard | undefined {
  const jobIdParsed = jobIdSchema.safeParse(data);
  const attachmentParsed = attachmentToolDataSchema.safeParse(data);
  if (!attachmentParsed.success) return undefined;

  const attachment = attachmentParsed.data.attachment;
  const attachmentId =
    attachmentParsed.data.documentId ?? attachmentParsed.data.entityId;
  if (attachmentId === undefined) return undefined;

  const source = attachment.source;
  const mediaLabel = describeAttachmentMedia(attachment.mediaType);
  return {
    kind: "attachment",
    id: `attachment:${attachmentId}`,
    ...(jobIdParsed.success ? { jobId: jobIdParsed.data.jobId } : {}),
    title: attachment.filename ?? `Generated ${mediaLabel}`,
    // Only describe the work as queued when there is a job backing it;
    // an already-materialized attachment arrives without a jobId.
    ...(jobIdParsed.success
      ? {
          description: `${mediaLabel} generation has been queued. This artifact will open once the job completes.`,
        }
      : {}),
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
  };
}

export interface ExtractedResults {
  toolResults: ToolResultData[];
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
        const attachmentCard = buildAttachmentCardFromToolData(
          successParsed.data.data,
        );
        if (attachmentCard) cards.push(attachmentCard);
      }

      toolResults.push(toolResult);
    }
  }

  return {
    toolResults,
    pendingConfirmations,
    cards,
    totalToolCalls,
  };
}

const entityRefDataSchema = z.object({
  entityId: z.string().min(1).optional(),
  updated: z.string().min(1).optional(),
  deleted: z.string().min(1).optional(),
  status: z.string().optional(),
});
const entityRefArgsSchema = z.object({
  entityType: z.string().optional(),
  id: z.string().optional(),
});

/**
 * Build a compact memory note listing the entities a turn created or updated.
 *
 * Conversation history is text-only, so tool results (and the entity IDs they
 * return) are otherwise lost after a turn — a follow-up like "add a cover image
 * to that post" then has no ID to reference and is forced to search. Appending
 * this note to the stored assistant message keeps those IDs addressable on the
 * next turn. Returns "" when no tool produced an addressable entity.
 */
export function buildEntityMemoryNote(toolResults: ToolResultData[]): string {
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const tr of toolResults) {
    const data = entityRefDataSchema.safeParse(tr.data);
    if (!data.success) continue;
    const { status } = data.data;
    const entityId =
      data.data.entityId ?? data.data.updated ?? data.data.deleted;
    if (!entityId || seen.has(entityId)) continue;
    seen.add(entityId);

    const args = entityRefArgsSchema.safeParse(tr.args ?? {});
    const entityType = args.success ? args.data.entityType : undefined;
    const operation = data.data.updated
      ? "updated"
      : data.data.deleted
        ? "deleted"
        : status;
    const label = entityType ? `${entityType} "${entityId}"` : `"${entityId}"`;
    refs.push(operation ? `${label} (${operation})` : label);
  }
  if (refs.length === 0) return "";
  return `\n\n[Entities affected this turn: ${refs.join("; ")}. Reference these IDs directly in follow-ups instead of searching for them.]`;
}
