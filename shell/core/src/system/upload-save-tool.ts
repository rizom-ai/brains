import type { CreateExecutionContext } from "@brains/entity-service";
import { ConfirmationArgsStore, type Tool } from "@brains/mcp-service";
import { uploadSaveInputSchema } from "./schemas";
import { assertEntityActionAllowed } from "./entity-action-policy";
import type { SystemServices } from "./types";
import {
  createSystemTool,
  isUploadRefInConversation,
  normalizeOptionalString,
} from "./tool-helpers";

const uploadScope = {
  namespace: "upload",
  refKind: "upload",
  routePath: "/api/chat/uploads",
} as const;

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
  const confirmationArgsStore = new ConfirmationArgsStore();

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
        const validation = confirmationArgsStore.validate(
          input.confirmationToken,
          input,
        );
        if (validation.status === "missing") {
          return {
            success: false,
            error:
              "No pending upload-save confirmation found. Please request the upload save again and confirm the new approval.",
          };
        }
        if (validation.status === "mismatch") {
          return {
            success: false,
            error:
              "Confirmed upload-save arguments do not match the pending approval. Please request the upload save again and confirm the new approval.",
          };
        }
      } else {
        const confirmation = buildUploadSaveConfirmation({
          ...(title && { title }),
          filename: uploadRecord.filename,
          mediaType: uploadRecord.mediaType,
          entityType: registration.entityType,
        });
        const args = confirmationArgsStore.create((confirmationToken) => ({
          upload: input.upload,
          ...(title && { title }),
          confirmed: true,
          confirmationToken,
        }));
        return {
          needsConfirmation: true,
          toolName: "system_upload_save",
          summary: confirmation.summary,
          preview: confirmation.preview,
          args,
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
    { visibility: "trusted", sideEffects: "writes" },
  );
}
