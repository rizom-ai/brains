import type {
  CreateExecutionContext,
  CreateFromAttachmentInput,
  CreateInput,
  CreateInterceptionResult,
  EntityPluginContext,
  EntityTypeConfig,
  JobHandler,
  Plugin,
} from "@brains/plugins";
import { EntityPlugin, resolveEntityOrError } from "@brains/plugins";
import { slugify, z } from "@brains/utils";
import { imageSchema, imageAdapter, type Image } from "@brains/image";
import { ImageGenerationJobHandler } from "./handlers/image-generation-handler";
import { SourceImageRenderJobHandler } from "./handlers/source-image-render-handler";
import { UploadPromotionJobHandler } from "./handlers/upload-promotion-handler";
import {
  getDistillableEntityContent,
  isImageDataUrl,
} from "./lib/distillable-content";
import {
  getUploadImageIdentity,
  isSupportedImageMediaType,
  webChatUploadsScope,
} from "./lib/upload-promotion";
import packageJson from "../package.json";

const imageConfigSchema = z.object({
  defaultAspectRatio: z
    .enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
    .default("16:9")
    .describe("Default aspect ratio for generated images"),
});

type ImageConfig = z.infer<typeof imageConfigSchema>;

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function getImageGenerationPrompt(input: CreateInput): string | undefined {
  const prompt = normalizeText(input.prompt);
  if (prompt) return prompt;

  const content = normalizeText(input.content);
  if (content && !isImageDataUrl(content)) return content;

  return undefined;
}

function getPredictedSourceImageId(input: {
  sourceEntityType: string;
  sourceEntityId: string;
  attachmentType: string;
}): string {
  const prefix =
    input.attachmentType === "og-image" ? "og" : input.attachmentType;
  return slugify(`${prefix}-${input.sourceEntityType}-${input.sourceEntityId}`);
}

function getPredictedImageId(input: {
  prompt: string;
  title?: string;
  targetEntityId?: string;
}): string {
  const title =
    normalizeText(input.title) ??
    (input.targetEntityId
      ? `cover-${input.targetEntityId}`
      : input.prompt.slice(0, 60).trim());
  return slugify(title);
}

async function getSourceDedupKey(
  context: EntityPluginContext,
  input: {
    sourceEntityType: string;
    sourceEntityId: string;
    attachmentType: string;
  },
): Promise<string> {
  const base = `${input.attachmentType}:${input.sourceEntityType}:${input.sourceEntityId}:resolved-attachment`;
  const source = await context.entityService.getEntity({
    entityType: input.sourceEntityType,
    id: input.sourceEntityId,
  });
  return source ? `${base}:${source.contentHash}` : base;
}

function buildPredictedImageAttachment(
  imageId: string,
  attachmentType = "generated",
): {
  mediaType: "image/png";
  url: string;
  downloadUrl: string;
  filename: string;
  source: {
    entityType: "image";
    entityId: string;
    attachmentType: string;
  };
} {
  const encodedId = encodeURIComponent(imageId);
  return {
    mediaType: "image/png",
    url: `/api/chat/attachments/image?id=${encodedId}`,
    downloadUrl: `/api/chat/attachments/image?id=${encodedId}&download=1`,
    filename: `${imageId}.png`,
    source: {
      entityType: "image",
      entityId: imageId,
      attachmentType,
    },
  };
}

function buildUploadedImageAttachment(input: {
  mediaType: string;
  entityId: string;
  filename: string;
}): {
  mediaType: string;
  url: string;
  downloadUrl: string;
  filename: string;
  source: {
    entityType: "image";
    entityId: string;
    attachmentType: "uploaded";
  };
} {
  const encodedId = encodeURIComponent(input.entityId);
  return {
    mediaType: input.mediaType,
    url: `/api/chat/attachments/image?id=${encodedId}`,
    downloadUrl: `/api/chat/attachments/image?id=${encodedId}&download=1`,
    filename: input.filename,
    source: {
      entityType: "image",
      entityId: input.entityId,
      attachmentType: "uploaded",
    },
  };
}

/**
 * Image EntityPlugin — manages image entities with AI generation.
 *
 * Zero tools. Image operations go through:
 * - system_create { entityType: "image", content: dataUrl } — upload
 * - system_create { entityType: "image", prompt: "..." } — AI generation
 * - system_update { fields: { coverImageId } } — set cover image references
 */
export class ImagePlugin extends EntityPlugin<Image, ImageConfig> {
  readonly entityType = imageAdapter.entityType;
  readonly schema = imageSchema;
  readonly adapter = imageAdapter;

  constructor(config: Partial<ImageConfig> = {}) {
    super("image", packageJson, config, imageConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return { embeddable: false };
  }

  protected override async interceptCreate(
    input: CreateInput,
    _executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    if (input.from?.kind === webChatUploadsScope.refKind) {
      return this.promoteUpload(input, context);
    }

    const prompt = getImageGenerationPrompt(input);
    const targetEntityType = normalizeText(input.targetEntityType);
    const targetEntityId = normalizeText(input.targetEntityId);
    const imageTargetTitle =
      targetEntityType === this.entityType ? targetEntityId : undefined;

    const from = input.from;
    if (from?.kind === "entity-attachment") {
      return this.enqueueSourceImageRender({ ...input, from }, context);
    }

    if (!targetEntityType || !targetEntityId || imageTargetTitle) {
      if (!prompt) return { kind: "continue", input };

      const title = normalizeText(input.title) ?? imageTargetTitle;
      const jobId = await context.jobs.enqueue({
        type: "image-generate",
        data: {
          prompt,
          ...(title && { title }),
        },
      });

      const entityId = getPredictedImageId({
        prompt,
        ...(title && { title }),
      });
      return {
        kind: "handled",
        result: {
          success: true,
          data: {
            entityId,
            status: "generating",
            jobId,
            attachment: buildPredictedImageAttachment(entityId),
          },
        },
      };
    }

    const resolved = await resolveEntityOrError(
      context.entityService,
      targetEntityType,
      targetEntityId,
      this.logger,
      "Target entity",
    );

    if (!resolved.ok) {
      return {
        kind: "handled",
        result: { success: false, error: resolved.error },
      };
    }

    if (!prompt) {
      return {
        kind: "continue",
        input: { ...input, targetEntityId: resolved.entity.id },
      };
    }

    const entityContent = getDistillableEntityContent(resolved.entity.content);
    const jobId = await context.jobs.enqueue({
      type: "image-generate",
      data: {
        prompt,
        ...(input.title && { title: input.title }),
        targetEntityType,
        targetEntityId: resolved.entity.id,
        entityTitle:
          typeof resolved.entity.metadata["title"] === "string"
            ? resolved.entity.metadata["title"]
            : resolved.entity.id,
        ...(entityContent && { entityContent }),
      },
    });

    const entityId = getPredictedImageId({
      prompt,
      ...(input.title && { title: input.title }),
      targetEntityId: resolved.entity.id,
    });
    return {
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId,
          status: "generating",
          jobId,
          attachment: buildPredictedImageAttachment(entityId),
        },
      },
    };
  }

  private async promoteUpload(
    input: CreateInput,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    const uploadRef = input.from;
    if (uploadRef?.kind !== webChatUploadsScope.refKind) {
      return {
        kind: "handled",
        result: { success: false, error: "Unsupported upload ref kind" },
      };
    }

    const uploadId = uploadRef.id;
    let uploadRecord;
    try {
      uploadRecord = await context.uploads
        .scoped(webChatUploadsScope)
        .readRecord(uploadId);
    } catch {
      return {
        kind: "handled",
        result: { success: false, error: "Upload ref not found" },
      };
    }

    if (!isSupportedImageMediaType(uploadRecord.mediaType)) {
      return {
        kind: "handled",
        result: {
          success: false,
          error: "Only image uploads can be promoted to image entities",
        },
      };
    }

    let identity;
    try {
      identity = getUploadImageIdentity({
        filename: uploadRecord.filename,
        ...(input.title !== undefined ? { title: input.title } : {}),
      });
    } catch (error) {
      return {
        kind: "handled",
        result: {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }

    const jobId = await context.jobs.enqueue({
      type: "upload-promote",
      data: {
        uploadId,
        ...(input.title !== undefined ? { title: input.title } : {}),
      },
    });

    return {
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: identity.id,
          status: "generating",
          jobId,
          attachment: buildUploadedImageAttachment({
            mediaType: uploadRecord.mediaType,
            entityId: identity.id,
            filename: uploadRecord.filename,
          }),
        },
      },
    };
  }

  private async enqueueSourceImageRender(
    input: CreateInput & { from: CreateFromAttachmentInput },
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    const sourceEntityType = normalizeText(input.from.sourceEntityType);
    const sourceEntityId = normalizeText(input.from.sourceEntityId);
    const attachmentType = normalizeText(input.from.attachmentType);
    if (!sourceEntityType || !sourceEntityId || !attachmentType) {
      return {
        kind: "handled",
        result: {
          success: false,
          error:
            "Image source requires sourceEntityType, sourceEntityId, and attachmentType",
        },
      };
    }

    const source = await resolveEntityOrError(
      context.entityService,
      sourceEntityType,
      sourceEntityId,
      this.logger,
      "Source entity",
    );
    if (!source.ok) {
      return {
        kind: "handled",
        result: { success: false, error: source.error },
      };
    }

    const targetEntityType = normalizeText(input.targetEntityType);
    const targetEntityId = normalizeText(input.targetEntityId);
    let resolvedTargetId: string | undefined;
    if (targetEntityType && targetEntityId) {
      const target = await resolveEntityOrError(
        context.entityService,
        targetEntityType,
        targetEntityId,
        this.logger,
        "Target entity",
      );
      if (!target.ok) {
        return {
          kind: "handled",
          result: { success: false, error: target.error },
        };
      }
      resolvedTargetId = target.entity.id;
    }

    const sourceInput = {
      sourceEntityType,
      sourceEntityId: source.entity.id,
      attachmentType,
    };
    const dedupKey = await getSourceDedupKey(context, sourceInput);
    const imageId = getPredictedSourceImageId(sourceInput);
    const jobId = await context.jobs.enqueue({
      type: "image-render-source",
      data: {
        ...sourceInput,
        imageId,
        dedupKey,
        ...(input.replace === true && { replace: true }),
        ...(targetEntityType && { targetEntityType }),
        ...(resolvedTargetId && { targetEntityId: resolvedTargetId }),
        ...(attachmentType === "og-image" && { targetImageField: "ogImageId" }),
      },
    });

    return {
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: imageId,
          status: "generating",
          jobId,
          attachment: buildPredictedImageAttachment(imageId, attachmentType),
        },
      },
    };
  }

  protected override async getInstructions(): Promise<string> {
    return `For durable raw image saves/promotions from uploaded images, call system_create with entityType: "image", the exact upload object shown in the current turn or conversation "Available runtime upload refs" hint, and no transform. Do this only after the user explicitly asks to save/import/promote the upload. If that hint is absent, omit upload entirely; never invent upload IDs or placeholder upload refs. Describing or summarizing an uploaded image should use it as chat context, not create an image entity. After a bare upload acknowledgement, a short label/title-only follow-up is ambiguous; ask what to do with the upload instead of turning that label into an AI image-generation prompt. For AI-generated images, call system_create with entityType: "image" and a prompt, and omit upload/sourceAttachment entirely.`;
  }

  protected override createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler {
    return new ImageGenerationJobHandler(context, this.logger);
  }

  /**
   * Also register the legacy "image-generate" handler name for backward
   * compatibility — existing enqueued jobs use this type.
   */
  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    const handler = new ImageGenerationJobHandler(context, this.logger);
    context.jobs.registerHandler("image-generate", handler);
    context.jobs.registerHandler(
      "image-render-source",
      new SourceImageRenderJobHandler(context, this.logger),
    );
    context.jobs.registerHandler(
      "upload-promote",
      new UploadPromotionJobHandler(
        this.logger.child("UploadPromotionJobHandler"),
        context,
      ),
    );
  }
}

export function imagePlugin(config?: Partial<ImageConfig>): Plugin {
  return new ImagePlugin(config);
}
