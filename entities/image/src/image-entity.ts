import {
  defineEntity,
  fetchStyleGuide,
  formatVisualGuidance,
  getErrorMessage,
  sourceAttachmentKey,
  z,
  type EntityCreateAllocation,
  type EntityCreateContext,
  type EntityCreateResolution,
  type EntityDefinition,
  type EntityGenerationJobDeclaration,
  type EntityGenerationResult,
} from "@brains/sdk/entities";
import {
  createDataUrl,
  imageDataUrl,
  imageMetadataFor,
  imageMetadataSchema,
  parseDataUrl,
  type Image,
} from "@brains/image";
import { buildImageBasePrompt } from "./lib/build-image-base-prompt";
import {
  generatedImageId,
  generatedImageTitle,
  sourceImageId,
} from "./lib/image-identity";
import { imageFieldFor, imageLink } from "./lib/image-link";
import {
  distillable,
  isImageDataUrl,
  isSupportedImageMediaType,
} from "./lib/image-content";

const PENDING_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const IMAGE_INSTRUCTIONS =
  "Image entities store durable images. Standalone generated images are valid system_generate image calls with a prompt source and no target fields. A prompt source creates a new image; never use it to describe, analyze, or discuss an existing uploaded image. For uploaded-image discussion, answer directly from the attachment/context; if the user later asks to save that discussion as a note, create entityType note from prior-response or exact text. targetEntityType and targetEntityId are only for attaching the result to an existing entity as coverImageId. Cover images and OG/social preview images are distinct domain concepts: cover-image fields use coverImageId, while OG/Open Graph/social preview fields use ogImageId. Rendered OG/social preview images are deterministic attachment-source images with attachmentType og-image.";

const linkSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  // A target holds one image per role, so this is a field rather than a list.
  field: z.enum(["coverImageId", "ogImageId"]),
});

const generateInput = z.object({
  entityId: z.string().min(1),
  prompt: z.string().min(1),
  title: z.string().min(1).optional(),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional(),
  /** The entity this image is for, as material for distilling a concept. */
  entityTitle: z.string().min(1).optional(),
  entityContent: z.string().min(1).optional(),
  linkInto: linkSchema.optional(),
});

const renderInput = z.object({
  entityId: z.string().min(1),
  sourceEntityType: z.string().min(1),
  sourceEntityId: z.string().min(1),
  attachmentType: z.string().min(1),
  dedupKey: z.string().min(1),
  reuse: z.boolean().optional(),
  linkInto: linkSchema.optional(),
});

/**
 * Ask the model what to depict.
 *
 * Two steps rather than one: a concept distilled from the source entity's own
 * words, then the brain's visual direction applied to it. Keeping them apart
 * is what stops the style guide's rendering instructions from bleeding into
 * the subject and producing a picture of a colour palette.
 */
const generate: EntityGenerationJobDeclaration<typeof generateInput> = {
  input: generateInput,
  generate: async ({
    input,
    ai,
    entities,
    logger,
    progress,
  }): Promise<EntityGenerationResult> => {
    if (!ai.canGenerateImages()) {
      return {
        success: false,
        error: "Image generation not available: no API key configured",
      };
    }

    const title = generatedImageTitle(input);
    const styleGuide = await fetchStyleGuide(entities);
    const material = distillable(input.entityContent);
    let subject = input.prompt;

    if (material) {
      await progress.report({
        progress: 30,
        message: "Distilling image prompt from content",
      });
      try {
        const { object } = await ai.generateObject(
          conceptPrompt({
            title: input.entityTitle ?? title,
            material,
            visualGuidance: formatVisualGuidance(styleGuide).trim(),
          }),
          z.object({
            imagePrompt: z
              .string()
              .describe(
                "A concise, vivid image prompt capturing the core visual concept",
              ),
          }),
        );
        subject = `${input.prompt.trim()} ${object.imagePrompt}`;
      } catch (error) {
        // The raw prompt is a worse subject than a distilled one, not an
        // unusable one — so a distillation that fails is not a failed job.
        logger.warn(
          "AI prompt distillation failed, using the prompt as given",
          { error: getErrorMessage(error) },
        );
      }
    }

    await progress.report({ progress: 60, message: "Generating image" });
    const generated = await ai.generateImage(
      buildImageBasePrompt(styleGuide) + subject,
      input.aspectRatio ? { aspectRatio: input.aspectRatio } : {},
    );

    return {
      success: true,
      id: input.entityId,
      content: generated.dataUrl,
      metadata: imageMetadataFor(generated.dataUrl, {
        title,
        alt: title,
        attachmentType: "generated",
        ...(input.linkInto
          ? {
              sourceEntityType: input.linkInto.entityType,
              sourceEntityId: input.linkInto.entityId,
            }
          : {}),
      }),
      ...(input.linkInto ? { linkInto: input.linkInto } : {}),
    };
  },
};

function conceptPrompt(input: {
  title: string;
  material: string;
  visualGuidance: string;
}): string {
  return `You are a visual concept designer. Given source content, describe WHAT TO DEPICT, not how to render it.

Rules:
- Identify one clear visual subject, scene, or metaphor that communicates the central idea
- Avoid generic visual clichés unless they are genuinely central to the source
- Describe only subjects and their spatial relationships; omit colors, lighting, materials, medium, and rendering instructions
- Keep the result to 1-2 sentences
${input.visualGuidance ? `- Let the supplied visual guidance influence concept selection without repeating rendering instructions\n\nVisual guidance:\n${input.visualGuidance}\n` : ""}
Title: "${input.title}"

Content:
${input.material}`;
}

/**
 * Store the image whichever provider owns this attachment produced.
 *
 * The provider renders; this stores what came back. Which is why a reuse can
 * skip straight to the existing entity — the expensive half is the
 * provider's, not this job's.
 */
const render: EntityGenerationJobDeclaration<typeof renderInput> = {
  input: renderInput,
  generate: async ({
    input,
    entities,
    attachments,
    progress,
  }): Promise<EntityGenerationResult> => {
    const link = input.linkInto ? { linkInto: input.linkInto } : {};

    if (input.reuse === true) {
      const existing = await entities.getEntity<Image>({
        entityType: "image",
        id: input.entityId,
      });
      if (!existing) {
        return {
          success: false,
          error: `Image "${input.entityId}" was reused but no longer exists`,
        };
      }
      await progress.report({
        progress: 100,
        message: "Reusing the image already rendered from this source",
      });
      return {
        success: true,
        id: existing.id,
        content: existing.content,
        metadata: existing.metadata,
        ...link,
      };
    }

    await progress.report({ progress: 40, message: "Rendering source image" });
    const attachment = await attachments.resolve({
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      attachmentType: input.attachmentType,
    });
    if (!attachment) {
      return {
        success: false,
        error: `No attachment provider found for ${input.sourceEntityType}/${input.attachmentType}`,
      };
    }
    if (attachment.type !== "image") {
      return {
        success: false,
        error: `Attachment provider returned ${attachment.type}; expected image`,
      };
    }

    // Format from the declared mime type rather than hardcoded, so this stays
    // correct if a provider ever emits something other than PNG.
    const dataUrl = createDataUrl(
      attachment.data.toString("base64"),
      attachment.mimeType.split("/")[1] ?? "png",
    );
    return {
      success: true,
      id: input.entityId,
      content: dataUrl,
      metadata: imageMetadataFor(dataUrl, {
        title: input.entityId,
        alt: input.entityId,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        attachmentType: input.attachmentType,
        dedupKey: input.dedupKey,
      }),
      ...link,
    };
  },
};

/**
 * Where a generated image should be linked, once the target is known to
 * exist. Refuses rather than generating into nowhere: an image attached to
 * an entity that is not there is work nobody will see.
 */
async function resolveTarget(
  context: EntityCreateContext,
): Promise<
  | { readonly kind: "none" }
  | {
      readonly kind: "target";
      readonly id: string;
      readonly entityType: string;
    }
  | { readonly kind: "refuse"; readonly refuse: string }
> {
  const entityType = context.input.targetEntityType?.trim();
  const identifier = context.input.targetEntityId?.trim();
  if (!entityType || !identifier) return { kind: "none" };
  // An image "targeting" an image is the caller naming what to call it, not
  // an entity to attach to.
  if (entityType === "image") return { kind: "none" };

  const target = await context.entities.find(entityType, identifier);
  if (!target) {
    return {
      kind: "refuse",
      refuse: `Target entity not found: ${entityType}/${identifier}`,
    };
  }
  return { kind: "target", entityType, id: target.id };
}

function linkFor(
  target: { readonly entityType: string; readonly id: string },
  attachmentType?: string,
): z.output<typeof linkSchema> {
  return {
    entityType: target.entityType,
    entityId: target.id,
    field: imageFieldFor(attachmentType) as "coverImageId" | "ogImageId",
  };
}

/** The prompt a create is asking to generate from, if it is asking at all. */
function promptFrom(context: EntityCreateContext): string | undefined {
  const prompt = context.input.prompt?.trim();
  if (prompt) return prompt;
  return distillable(context.input.content);
}

async function routeFromPrompt(
  context: EntityCreateContext,
): Promise<EntityCreateResolution | EntityCreateAllocation> {
  const prompt = promptFrom(context);
  if (!prompt) {
    return { refuse: "Generating an image needs a prompt to generate from" };
  }

  const resolved = await resolveTarget(context);
  if (resolved.kind === "refuse") return { refuse: resolved.refuse };
  const target = resolved.kind === "target" ? resolved : undefined;

  // An image asked for by name keeps that name; one asked for on behalf of
  // another entity is named after it.
  const requestedTitle =
    context.input.title?.trim() ??
    (context.input.targetEntityType === "image"
      ? context.input.targetEntityId?.trim()
      : undefined);
  const naming = {
    prompt,
    ...(requestedTitle !== undefined ? { title: requestedTitle } : {}),
    ...(target ? { targetEntityId: target.id } : {}),
  };
  const id = generatedImageId(naming);
  const title = generatedImageTitle(naming);

  const material = target
    ? await distillableTargetContent(context, target)
    : undefined;

  return {
    create: {
      id,
      content: PENDING_IMAGE_DATA_URL,
      metadata: imageMetadataFor(PENDING_IMAGE_DATA_URL, {
        title,
        alt: title,
        status: "pending",
        attachmentType: "generated",
        ...(target
          ? {
              sourceEntityType: target.entityType,
              sourceEntityId: target.id,
            }
          : {}),
      }),
    },
    delegate: {
      job: "generate",
      input: {
        prompt,
        ...(requestedTitle !== undefined ? { title: requestedTitle } : {}),
        ...(target ? { linkInto: linkFor(target) } : {}),
        ...(material
          ? { entityTitle: material.title, entityContent: material.content }
          : {}),
      },
    },
    attachment: ({ entityId }) =>
      imageLink({ entityId, attachmentType: "generated" }),
  };
}

async function distillableTargetContent(
  context: EntityCreateContext,
  target: { readonly entityType: string; readonly id: string },
): Promise<{ title: string; content: string } | undefined> {
  const entity = await context.entities.getEntity({
    entityType: target.entityType,
    id: target.id,
  });
  const content = distillable(entity?.content);
  if (!entity || !content) return undefined;
  const title = entity.metadata["title"];
  return { title: typeof title === "string" ? title : entity.id, content };
}

async function routeFromContent(
  context: EntityCreateContext,
): Promise<EntityCreateResolution | EntityCreateAllocation> {
  const content = context.input.content?.trim();
  // Text is a description of what to make; a data URL is the thing itself.
  if (!content || !isImageDataUrl(content)) return routeFromPrompt(context);

  const title = context.input.title?.trim() ?? "image";
  return {
    create: {
      id: generatedImageId({ prompt: title, title }),
      content,
      metadata: imageMetadataFor(content, { title, alt: title }),
    },
    attachment: ({ entityId }) =>
      imageLink({
        entityId,
        attachmentType: "uploaded",
        mediaType: `image/${parseDataUrl(content).format}`,
      }),
  };
}

async function routeFromAttachment(
  context: EntityCreateContext,
): Promise<EntityCreateResolution | EntityCreateAllocation> {
  const from = context.input.from;
  if (from?.kind !== "entity-attachment") {
    return { refuse: "Rendering an image needs an entity's attachment" };
  }
  const source = {
    sourceEntityType: from.sourceEntityType.trim(),
    sourceEntityId: from.sourceEntityId.trim(),
    attachmentType: from.attachmentType.trim(),
  };
  if (
    !source.sourceEntityType ||
    !source.sourceEntityId ||
    !source.attachmentType
  ) {
    return {
      refuse:
        "Image source requires sourceEntityType, sourceEntityId, and attachmentType",
    };
  }

  const sourceEntity = await context.entities.find(
    source.sourceEntityType,
    source.sourceEntityId,
  );
  if (!sourceEntity) {
    return {
      refuse: `Source entity not found: ${source.sourceEntityType}/${source.sourceEntityId}`,
    };
  }
  const resolvedSource = { ...source, sourceEntityId: sourceEntity.id };

  const resolved = await resolveTarget(context);
  if (resolved.kind === "refuse") return { refuse: resolved.refuse };
  const link =
    resolved.kind === "target"
      ? { linkInto: linkFor(resolved, source.attachmentType) }
      : {};

  const dedupKey = sourceAttachmentKey({
    ...resolvedSource,
    sourceContentHash: sourceEntity.contentHash,
  });
  const existing =
    context.input.replace === true
      ? undefined
      : await findReusableImage(context, dedupKey);
  const attachment = ({
    entityId,
  }: {
    entityId: string;
  }): ReturnType<typeof imageLink> =>
    imageLink({ entityId, attachmentType: source.attachmentType });

  if (existing) {
    return {
      existing: { id: existing.id },
      delegate: {
        job: "render",
        input: { ...resolvedSource, dedupKey, reuse: true, ...link },
      },
      attachment,
    };
  }

  const id = sourceImageId(resolvedSource);
  return {
    create: {
      id,
      content: PENDING_IMAGE_DATA_URL,
      metadata: imageMetadataFor(PENDING_IMAGE_DATA_URL, {
        title: id,
        alt: id,
        status: "pending",
        ...resolvedSource,
        dedupKey,
      }),
    },
    delegate: {
      job: "render",
      input: { ...resolvedSource, dedupKey, ...link },
    },
    attachment,
  };
}

async function findReusableImage(
  context: EntityCreateContext,
  dedupKey: string,
): Promise<Image | undefined> {
  const images = await context.entities.listEntities<Image>({
    entityType: "image",
    options: { filter: { metadata: { dedupKey } } },
  });
  if (images.length > 1) {
    context.logger.warn("Multiple images share dedupKey; using first", {
      dedupKey,
      ids: images.map((image) => image.id),
    });
  }
  return images.find(
    (image) =>
      image.metadata.status !== "pending" && image.metadata.status !== "failed",
  );
}

async function routeFromUpload(
  context: EntityCreateContext,
): Promise<EntityCreateResolution> {
  const from = context.input.from;
  if (from?.kind !== "upload") return { refuse: "Upload ref not found" };

  const upload = await context.uploads.read(from.id).catch(() => null);
  if (!upload) return { refuse: "Upload ref not found" };
  if (!isSupportedImageMediaType(upload.record.mediaType)) {
    return { refuse: "Only image uploads can be preserved as image entities" };
  }

  const title = uploadTitle(context.input.title, upload.record.filename);
  const id = generatedImageId({ prompt: title, title });
  if (!id) {
    return {
      refuse:
        "Could not derive an image id from the uploaded filename. Provide a title.",
    };
  }

  const dataUrl = imageDataUrl(upload.record.mediaType, upload.content);
  return {
    create: {
      id,
      content: dataUrl,
      metadata: imageMetadataFor(dataUrl, {
        title,
        alt: title,
        sourceUploadId: from.id,
        sourceFilename: upload.record.filename,
        sourceMediaType: upload.record.mediaType,
        attachmentType: "uploaded",
      }),
    },
    attachment: ({ entityId }) =>
      imageLink({
        entityId,
        attachmentType: "uploaded",
        mediaType: upload.record.mediaType,
        filename: upload.record.filename,
      }),
  };
}

function uploadTitle(requested: string | undefined, filename: string): string {
  const title = requested?.trim();
  if (title) return title;
  const withoutExtension = filename.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || filename;
}

/**
 * A durable image: a generated cover, a rendered social preview, an upload
 * the brain kept.
 *
 * The content is the image itself as a data URL. Unlike a document, the
 * bytes do describe themselves — format and dimensions are read back out of
 * them, so a decode recovers the metadata a file has.
 */
export const image: EntityDefinition<"image", typeof imageMetadataSchema> =
  defineEntity({
    type: "image",
    purpose:
      "Image assets such as generated covers, social previews, and uploaded images.",
    metadata: imageMetadataSchema,
    config: {
      embeddable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    },
    markdown: {
      decode: ({ content }) => ({
        content,
        metadata: imageMetadataFor(content),
      }),
      encode: ({ content }) => ({ content, frontmatter: {} }),
    },
    jobs: { generate, render },
    create: {
      fromUpload: {
        mediaTypes: ["image/*"],
        resolve: routeFromUpload,
      },
      fromAttachment: { resolve: routeFromAttachment },
      fromPrompt: { resolve: routeFromPrompt },
      fromContent: { resolve: routeFromContent },
    },
    instructions: IMAGE_INSTRUCTIONS,
  });
