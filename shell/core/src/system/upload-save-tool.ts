import type { CreateExecutionContext } from "@brains/entity-service";
import type { Tool } from "@brains/mcp-service";
import { z } from "@brains/utils/zod-v4";
import { uploadSaveInputSchema } from "./schemas";
import { assertEntityActionAllowed } from "./entity-action-policy";
import type { SystemServices } from "./types";
import { createSystemTool, normalizeOptionalString } from "./tool-helpers";

const uploadScope = {
  namespace: "upload",
  refKind: "upload",
  routePath: "/api/chat/uploads",
} as const;

const messageMetadataSchema = z.record(z.string(), z.unknown());

function parseMessageMetadata(
  metadata: unknown,
): Record<string, unknown> | null {
  if (typeof metadata === "string") {
    try {
      const parsed = messageMetadataSchema.safeParse(JSON.parse(metadata));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
  return isRecord(metadata) ? metadata : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function isUploadRefInConversation(
  services: SystemServices,
  input: { kind: string; id: string },
  conversationId: string | undefined,
): Promise<boolean> {
  if (!conversationId) return false;
  const messages = await services.conversationService.getMessages(
    conversationId,
    { limit: 100 },
  );
  for (const message of messages) {
    const metadata = parseMessageMetadata(message.metadata);
    const attachments = metadata?.["attachments"];
    if (!Array.isArray(attachments)) continue;
    for (const attachment of attachments) {
      if (!isRecord(attachment)) continue;
      const source = attachment["source"];
      if (!isRecord(source)) continue;
      if (source["kind"] === input.kind && source["id"] === input.id) {
        return true;
      }
    }
  }
  return false;
}

function buildUploadSaveConfirmation(input: {
  title?: string;
  filename: string;
  mediaType: string;
  entityType: string;
}): { summary: string; preview: string } {
  const label = input.title ? ` as "${input.title}"` : "";
  return {
    summary: `Save uploaded file${label}?`,
    preview: [
      `Filename: ${input.filename}`,
      `Media type: ${input.mediaType}`,
      `Entity type: ${input.entityType}`,
      ...(input.title ? [`Title: ${input.title}`] : []),
    ].join("\n"),
  };
}

export function createUploadSaveTool(services: SystemServices): Tool {
  const pendingConfirmationTokens = new Set<string>();

  return createSystemTool(
    "upload_save",
    "Save a live uploaded file as its durable entity type. Requires confirmation. Use only for raw uploaded file preservation; use system_create for notes, summaries, generated content, URLs, and source-derived artifacts.",
    uploadSaveInputSchema,
    async (input, toolContext) => {
      const title = normalizeOptionalString(input.title);
      const hasAccess = await isUploadRefInConversation(
        services,
        input.upload,
        toolContext.conversationId ?? toolContext.channelId,
      );
      if (!hasAccess) {
        return {
          success: false,
          error:
            "Upload ref is not accessible in this conversation or no longer exists.",
        };
      }

      let uploadRecord;
      try {
        uploadRecord = await services.runtimeUploads
          .scoped(uploadScope)
          .readRecord(input.upload.id);
      } catch {
        return { success: false, error: "Upload ref not found" };
      }

      const registration = services.entityRegistry.getUploadSaveHandler(
        uploadRecord.mediaType,
      );
      if (!registration) {
        return {
          success: false,
          error: `No installed plugin can save uploads with media type "${uploadRecord.mediaType}".`,
        };
      }

      const policyError = assertEntityActionAllowed(
        services,
        registration.entityType,
        "create",
        toolContext,
      );
      if (policyError) return policyError;

      if (input.confirmed) {
        const token = input.confirmationToken;
        if (!token || !pendingConfirmationTokens.has(token)) {
          return {
            success: false,
            error:
              "No pending upload-save confirmation found. Please request the upload save again and confirm the new approval.",
          };
        }
        pendingConfirmationTokens.delete(token);
      } else {
        const confirmationToken = crypto.randomUUID();
        pendingConfirmationTokens.add(confirmationToken);
        const confirmation = buildUploadSaveConfirmation({
          ...(title && { title }),
          filename: uploadRecord.filename,
          mediaType: uploadRecord.mediaType,
          entityType: registration.entityType,
        });
        return {
          needsConfirmation: true,
          toolName: "system_upload_save",
          summary: confirmation.summary,
          preview: confirmation.preview,
          args: {
            upload: input.upload,
            ...(title && { title }),
            confirmed: true,
            confirmationToken,
          },
        };
      }

      const executionContext: CreateExecutionContext = {
        interfaceType: toolContext.interfaceType,
        userId: toolContext.userId,
        ...(toolContext.channelId && { channelId: toolContext.channelId }),
        ...(toolContext.channelName && {
          channelName: toolContext.channelName,
        }),
      };
      return registration.handler(
        { upload: input.upload, ...(title && { title }) },
        executionContext,
      );
    },
    { visibility: "trusted" },
  );
}
