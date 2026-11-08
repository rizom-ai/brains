import {
  imageGenerateJobContract,
  imageRenderSourceJobContract,
} from "@brains/contracts";
import { createImageEntity, type imageMetadataSchema } from "@brains/image";
import type {
  EntityCreateContext,
  EntityCreateRouting,
} from "@brains/sdk/entities";
import { entityRuntime } from "@brains/sdk/internal/entity-runtime";
import { getErrorMessage } from "@brains/utils/error";
import { slugify } from "@brains/utils/string-utils";
import {
  buildPredictedImageAttachment,
  buildUploadedImageAttachment,
} from "./lib/image-attachments";
import {
  getDistillableEntityContent,
  isImageDataUrl,
} from "./lib/distillable-content";
import {
  getUploadImageIdentity,
  isSupportedImageMediaType,
} from "./lib/upload-promotion";
import { uploadPromotionJobContract } from "./jobs/promote-upload";

const PENDING_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

interface Resolution {
  readonly refuse: string;
}

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function getImageGenerationPrompt(
  input: EntityCreateContext["input"],
): string | undefined {
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

/** A pending image's placeholder: its metadata, and the content it holds until filled. */
function pendingImage(input: {
  title: string;
  alt: string;
  attachmentType: string;
  visibility?: EntityCreateContext["input"]["visibility"];
  sourceEntityType?: string;
  sourceEntityId?: string;
  sourceUploadId?: string;
  sourceFilename?: string;
  sourceMediaType?: string;
  dedupKey?: string;
}): NonNullable<
  Parameters<ReturnType<typeof entityRuntime>["queued"]>[0]["placeholder"]
> {
  const entityData = createImageEntity({
    dataUrl: PENDING_IMAGE_DATA_URL,
    title: input.title,
    alt: input.alt,
    status: "pending",
    attachmentType: input.attachmentType,
    ...(input.sourceEntityType && { sourceEntityType: input.sourceEntityType }),
    ...(input.sourceEntityId && { sourceEntityId: input.sourceEntityId }),
    ...(input.sourceUploadId && { sourceUploadId: input.sourceUploadId }),
    ...(input.sourceFilename && { sourceFilename: input.sourceFilename }),
    ...(input.sourceMediaType && { sourceMediaType: input.sourceMediaType }),
    ...(input.dedupKey && { dedupKey: input.dedupKey }),
  });
  return {
    content: entityData.content,
    metadata: entityData.metadata,
    ...(input.visibility !== undefined && { visibility: input.visibility }),
  };
}

/**
 * A prompt, or content that is not an image, generates an image: on its
 * own, or as a target's cover. Without a prompt the request goes on to the
 * ordinary create, with the target it names resolved.
 */
async function routeGeneration(
  context: EntityCreateContext,
): Promise<Resolution> {
  const { input } = context;
  const runtime = entityRuntime(context);
  const prompt = getImageGenerationPrompt(input);
  const targetEntityType = normalizeText(input.targetEntityType);
  const targetEntityId = normalizeText(input.targetEntityId);
  const imageTargetTitle =
    targetEntityType === "image" ? targetEntityId : undefined;

  if (!targetEntityType || !targetEntityId || imageTargetTitle) {
    if (!prompt) return runtime.ordinaryCreate();

    const title = normalizeText(input.title) ?? imageTargetTitle;
    const entityId = getPredictedImageId({
      prompt,
      ...(title && { title }),
    });
    return runtime.queued({
      entityId,
      placeholder: pendingImage({
        title: title ?? prompt.slice(0, 60).trim(),
        alt: title ?? prompt.slice(0, 60).trim(),
        attachmentType: "generated",
        visibility: input.visibility,
      }),
      job: {
        contract: imageGenerateJobContract,
        data: { prompt, ...(title && { title }) },
      },
      attachment: buildPredictedImageAttachment(entityId),
    });
  }

  const target = await runtime.anyEntities.find(
    targetEntityType,
    targetEntityId,
  );
  if (!target) {
    return {
      refuse: `Target entity not found: ${targetEntityType}/${targetEntityId}`,
    };
  }

  if (!prompt) {
    return runtime.ordinaryCreate(undefined, { targetEntityId: target.id });
  }

  const entityContent = getDistillableEntityContent(target.content);
  const entityId = getPredictedImageId({
    prompt,
    ...(input.title && { title: input.title }),
    targetEntityId: target.id,
  });
  return runtime.queued({
    entityId,
    placeholder: pendingImage({
      title: input.title ?? `cover-${target.id}`,
      alt: input.title ?? `cover-${target.id}`,
      attachmentType: "generated",
      visibility: input.visibility,
      sourceEntityType: targetEntityType,
      sourceEntityId: target.id,
    }),
    job: {
      contract: imageGenerateJobContract,
      data: {
        prompt,
        ...(input.title && { title: input.title }),
        targetEntityType,
        targetEntityId: target.id,
        entityTitle:
          typeof target.metadata["title"] === "string"
            ? target.metadata["title"]
            : target.id,
        ...(entityContent && { entityContent }),
      },
    },
    attachment: buildPredictedImageAttachment(entityId),
  });
}

/** Another entity's attachment, such as its OG preview, rendered to an image. */
async function routeAttachment(
  context: EntityCreateContext,
): Promise<Resolution> {
  const { input } = context;
  const runtime = entityRuntime(context);
  const from =
    input.from?.kind === "entity-attachment" ? input.from : undefined;
  const sourceEntityType = normalizeText(from?.sourceEntityType);
  const sourceEntityId = normalizeText(from?.sourceEntityId);
  const attachmentType = normalizeText(from?.attachmentType);
  if (!sourceEntityType || !sourceEntityId || !attachmentType) {
    return {
      refuse:
        "Image source requires sourceEntityType, sourceEntityId, and attachmentType",
    };
  }

  const source = await runtime.anyEntities.find(
    sourceEntityType,
    sourceEntityId,
  );
  if (!source) {
    return {
      refuse: `Source entity not found: ${sourceEntityType}/${sourceEntityId}`,
    };
  }

  const targetEntityType = normalizeText(input.targetEntityType);
  const targetEntityId = normalizeText(input.targetEntityId);
  let resolvedTargetId: string | undefined;
  if (targetEntityType && targetEntityId) {
    const target = await runtime.anyEntities.find(
      targetEntityType,
      targetEntityId,
    );
    if (!target) {
      return {
        refuse: `Target entity not found: ${targetEntityType}/${targetEntityId}`,
      };
    }
    resolvedTargetId = target.id;
  }

  const sourceInput = {
    sourceEntityType,
    sourceEntityId: source.id,
    attachmentType,
  };
  // Keyed on the source's current content, so editing it renders anew.
  const base = `${attachmentType}:${sourceEntityType}:${source.id}:resolved-attachment`;
  const current = await runtime.anyEntities.getEntity({
    entityType: sourceEntityType,
    id: source.id,
  });
  const dedupKey = current ? `${base}:${current.contentHash}` : base;
  const imageId = getPredictedSourceImageId(sourceInput);
  return runtime.queued({
    entityId: imageId,
    placeholder: pendingImage({
      title: imageId,
      alt: imageId,
      sourceEntityType: sourceInput.sourceEntityType,
      sourceEntityId: sourceInput.sourceEntityId,
      attachmentType,
      dedupKey,
      visibility: input.visibility,
    }),
    job: {
      contract: imageRenderSourceJobContract,
      data: {
        ...sourceInput,
        imageId,
        dedupKey,
        ...(input.replace === true && { replace: true }),
        ...(targetEntityType && { targetEntityType }),
        ...(resolvedTargetId && { targetEntityId: resolvedTargetId }),
        ...(attachmentType === "og-image" && {
          targetImageField: "ogImageId",
        }),
      },
    },
    attachment: buildPredictedImageAttachment(imageId, attachmentType),
  });
}

/** An uploaded image, promoted to an image entity by its job. */
async function routeUpload(context: EntityCreateContext): Promise<Resolution> {
  const { input } = context;
  const uploadRef = input.from?.kind === "upload" ? input.from : undefined;
  if (!uploadRef) return { refuse: "Unsupported upload ref kind" };

  const uploadId = uploadRef.id;
  let uploadRecord;
  try {
    uploadRecord = await context.uploads.readRecord(uploadId);
  } catch {
    // An unreadable reference is one this create cannot promote.
    return { refuse: "Upload ref not found" };
  }

  if (!isSupportedImageMediaType(uploadRecord.mediaType)) {
    return { refuse: "Only image uploads can be promoted to image entities" };
  }

  let identity;
  try {
    identity = getUploadImageIdentity({
      filename: uploadRecord.filename,
      ...(input.title !== undefined ? { title: input.title } : {}),
    });
  } catch (error) {
    return { refuse: getErrorMessage(error) };
  }

  return entityRuntime(context).queued({
    entityId: identity.id,
    placeholder: pendingImage({
      title: identity.title,
      alt: identity.title,
      sourceUploadId: uploadId,
      sourceFilename: uploadRecord.filename,
      sourceMediaType: uploadRecord.mediaType,
      attachmentType: "uploaded",
      visibility: input.visibility,
    }),
    job: {
      contract: uploadPromotionJobContract,
      data: { uploadId, imageId: identity.id, title: identity.title },
      attributed: true,
    },
    attachment: buildUploadedImageAttachment({
      mediaType: uploadRecord.mediaType,
      entityId: identity.id,
      filename: uploadRecord.filename,
    }),
  });
}

/**
 * Image's create routes, as the image entity plugin's interceptor took
 * requests. A request with neither content nor a prompt reaches no route
 * and goes on to the ordinary create as made; one with a blank prompt and
 * a target therefore keeps the target as named, which the interceptor
 * resolved first, though system_generate's cover-image always has a prompt.
 */
export const imageCreateRouting: EntityCreateRouting<
  typeof imageMetadataSchema
> = {
  fromUpload: { mediaTypes: ["image/*"], resolve: routeUpload },
  fromAttachment: { resolve: routeAttachment },
  fromPrompt: { resolve: routeGeneration },
  fromContent: { resolve: routeGeneration },
};
