/**
 * Attachment Intake
 *
 * Turn-level attachment handling for AgentService: canned responses and
 * follow-up action cards for attachment-only messages, and hydration/
 * liveness filtering of prior-upload references via the injected upload
 * attachment resolver.
 */

import { z } from "@brains/utils/zod";
import type { Logger } from "@brains/utils/logger";
import type {
  ChatAttachment,
  StructuredChatCard,
  UploadAttachmentResolver,
} from "./agent-types";
import type { ConversationUploadRef } from "./conversation-messages";

const asyncGeneratingToolResultSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        status: z.literal("generating"),
        entityId: z.string().min(1).optional(),
        jobId: z.string().min(1).optional(),
      })
      .passthrough(),
  })
  .passthrough();

export function buildAsyncGenerationFallback(
  data: unknown,
): string | undefined {
  const parsed = asyncGeneratingToolResultSchema.safeParse(data);
  if (!parsed.success) return undefined;
  return "The draft is generating now. Once it is ready, I can review it with you, refine it, or turn it into another format.";
}

export function buildAttachmentOnlyResponse(
  attachments: ChatAttachment[],
): string {
  const filenames = attachments.map((attachment) => attachment.filename);
  const fileLabel =
    filenames.length === 1
      ? `\`${filenames[0]}\``
      : filenames.map((filename) => `\`${filename}\``).join(", ");
  return `I got ${fileLabel}. What would you like me to do with ${filenames.length === 1 ? "it" : "these files"}?`;
}

function isImageAttachment(attachment: ChatAttachment): boolean {
  return attachment.mediaType.startsWith("image/");
}

function isPdfAttachment(attachment: ChatAttachment): boolean {
  return attachment.mediaType === "application/pdf";
}

function isTextAttachment(attachment: ChatAttachment): boolean {
  return attachment.kind === "text" || attachment.mediaType.startsWith("text/");
}

export function buildAttachmentOnlyActionsCard(
  attachments: ChatAttachment[],
): StructuredChatCard | undefined {
  if (attachments.length === 0) return undefined;

  if (attachments.length > 1) {
    return {
      kind: "actions",
      id: "actions:upload-intent",
      title: "Try next",
      defaultOpen: true,
      actions: [
        {
          type: "prompt",
          id: "summarize-uploads",
          label: "Summarize uploads",
          prompt: "Summarize the uploaded files.",
        },
      ],
    };
  }

  const [attachment] = attachments;
  if (attachment === undefined) return undefined;

  if (isImageAttachment(attachment)) {
    return {
      kind: "actions",
      id: "actions:upload-intent",
      title: "Try next",
      defaultOpen: true,
      actions: [
        {
          type: "prompt",
          id: "describe-image",
          label: "Describe image",
          prompt: "Describe the uploaded image.",
        },
        {
          type: "prompt",
          id: "save-image",
          label: "Save image",
          prompt: "Save the uploaded image.",
        },
      ],
    };
  }

  if (isPdfAttachment(attachment)) {
    return {
      kind: "actions",
      id: "actions:upload-intent",
      title: "Try next",
      defaultOpen: true,
      actions: [
        {
          type: "prompt",
          id: "summarize-pdf",
          label: "Summarize PDF",
          prompt: "Summarize the uploaded PDF.",
        },
        {
          type: "prompt",
          id: "save-document",
          label: "Save document",
          prompt: "Save the uploaded PDF as a document.",
        },
      ],
    };
  }

  if (isTextAttachment(attachment)) {
    return {
      kind: "actions",
      id: "actions:upload-intent",
      title: "Try next",
      defaultOpen: true,
      actions: [
        {
          type: "prompt",
          id: "summarize-upload",
          label: "Summarize upload",
          prompt: "Summarize the uploaded file.",
        },
        {
          type: "prompt",
          id: "save-upload-note",
          label: "Save as note",
          prompt: "Save the uploaded file as a note.",
        },
      ],
    };
  }

  return {
    kind: "actions",
    id: "actions:upload-intent",
    title: "Try next",
    defaultOpen: true,
    actions: [
      {
        type: "prompt",
        id: "summarize-upload",
        label: "Summarize upload",
        prompt: "Summarize the uploaded file.",
      },
    ],
  };
}

/**
 * Keep only prior-upload refs the resolver can still produce, refreshing
 * filename/mediaType from the resolved attachment.
 */
export async function filterLiveUploadRefs(params: {
  refs: ConversationUploadRef[];
  resolver: UploadAttachmentResolver | undefined;
  logger: Logger;
}): Promise<ConversationUploadRef[]> {
  const { refs, resolver, logger } = params;
  if (refs.length === 0) return [];
  if (!resolver) return [];

  const liveRefs: ConversationUploadRef[] = [];
  for (const ref of refs) {
    try {
      const attachment = await resolver(ref.source);
      if (!attachment) continue;
      liveRefs.push({
        filename: attachment.filename,
        mediaType: attachment.mediaType,
        source: ref.source,
      });
    } catch (error) {
      logger.debug("Skipped unavailable prior upload ref", {
        uploadKind: ref.source.kind,
        uploadId: ref.source.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return liveRefs;
}

/**
 * When a turn has no attachments of its own and exactly one prior upload
 * is referenced, rehydrate that upload so the model can see it.
 */
export async function hydrateUploadAttachments(params: {
  currentAttachments: ChatAttachment[];
  uploadRefs: { source: NonNullable<ChatAttachment["source"]> }[];
  resolver: UploadAttachmentResolver | undefined;
  logger: Logger;
}): Promise<ChatAttachment[]> {
  const { currentAttachments, uploadRefs, resolver, logger } = params;
  if (currentAttachments.length > 0) return currentAttachments;
  if (!resolver) return currentAttachments;
  if (uploadRefs.length !== 1) return currentAttachments;

  const hydrated: ChatAttachment[] = [];
  for (const ref of uploadRefs.slice().reverse()) {
    try {
      const attachment = await resolver(ref.source);
      if (attachment) hydrated.push(attachment);
    } catch (error) {
      logger.debug("Skipped unavailable prior upload attachment", {
        uploadKind: ref.source.kind,
        uploadId: ref.source.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (hydrated.length > 0) break;
  }

  return hydrated.length > 0 ? hydrated : currentAttachments;
}
