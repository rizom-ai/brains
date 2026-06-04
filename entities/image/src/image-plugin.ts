import type {
  CreateExecutionContext,
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
import {
  getDistillableEntityContent,
  isImageDataUrl,
} from "./lib/distillable-content";
import packageJson from "../package.json";

const imageConfigSchema = z.object({
  defaultAspectRatio: z
    .enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
    .default("16:9")
    .describe("Default aspect ratio for generated images"),
});

type ImageConfig = z.infer<typeof imageConfigSchema>;

const webChatUploadsScope = {
  namespace: "web-chat",
  refKind: "web-chat-upload",
  routePath: "/api/chat/uploads",
} as const;

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

function toDataUrl(mediaType: string, content: Buffer): string {
  return `data:${mediaType};base64,${content.toString("base64")}`;
}

function getUploadTitle(input: CreateInput, filename: string): string {
  const title = normalizeText(input.title);
  if (title) return title;
  const withoutExt = filename.replace(/\.[^.]+$/, "").trim();
  return withoutExt || filename;
}

function isSupportedImageMediaType(mediaType: string): boolean {
  return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
    mediaType,
  );
}

function buildPredictedImageAttachment(imageId: string): {
  mediaType: "image/png";
  url: string;
  downloadUrl: string;
  filename: string;
  source: {
    entityType: "image";
    entityId: string;
    attachmentType: "generated";
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
      attachmentType: "generated",
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

    let upload;
    try {
      upload = await context.uploads
        .scoped(webChatUploadsScope)
        .read(uploadRef.id);
    } catch {
      return {
        kind: "handled",
        result: { success: false, error: "Upload ref not found" },
      };
    }

    if (!isSupportedImageMediaType(upload.record.mediaType)) {
      return {
        kind: "handled",
        result: {
          success: false,
          error: "Only image uploads can be promoted to image entities",
        },
      };
    }

    const title = getUploadTitle(input, upload.record.filename);
    const id = slugify(title);
    if (!id) {
      return {
        kind: "handled",
        result: {
          success: false,
          error:
            "Could not derive an image id from the uploaded filename. Provide a title.",
        },
      };
    }

    const now = new Date().toISOString();
    const imageEntity = imageAdapter.createImageEntity({
      dataUrl: toDataUrl(upload.record.mediaType, upload.content),
      title,
    });
    const result = await context.entityService.createEntity({
      entity: {
        id,
        ...imageEntity,
        created: now,
        updated: now,
      },
      options: { deduplicateId: true },
    });

    return {
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: result.entityId,
          status: "created",
          attachment: buildUploadedImageAttachment({
            mediaType: upload.record.mediaType,
            entityId: result.entityId,
            filename: upload.record.filename,
          }),
        },
      },
    };
  }

  protected override async getInstructions(): Promise<string> {
    return `For durable image saves from uploaded images, copy the exact upload object shown in the current turn's "Available runtime upload refs" hint only after the user explicitly asks to save/import/promote the upload. If that hint is absent, omit upload entirely; never invent upload IDs or placeholder upload refs. Describing or summarizing an uploaded image should use it as chat context, not create an image entity. For AI-generated images, call system_create with entityType: "image" and a prompt, and omit upload/sourceAttachment entirely.`;
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
  }
}

export function imagePlugin(config?: Partial<ImageConfig>): Plugin {
  return new ImagePlugin(config);
}
