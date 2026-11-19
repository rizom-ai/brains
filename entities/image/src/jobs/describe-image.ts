import {
  JobResult,
  imageDescribeJobContract,
  type ImageDescribeJobInput,
} from "@brains/contracts";
import { imageMediaType, type imageMetadataSchema } from "@brains/image";
import type {
  EntityDefinition,
  EntityJobDeclaration,
} from "@brains/sdk/entities";
import {
  contractJob,
  entityRuntime,
} from "@brains/sdk/internal/entity-runtime";

type ImageDefinition = EntityDefinition<"image", typeof imageMetadataSchema>;

/** One sentence a screen reader reads in passing; longer belongs in a caption. */
export const ALT_TEXT_LIMIT = 125;

const DESCRIBE_INSTRUCTION = `Write alt text for this image: one sentence, at most ${ALT_TEXT_LIMIT} characters, saying what it shows to someone who cannot see it. Quote any text that matters. Do not start with "Image of" or "Picture of". Answer with the sentence only.`;

export type ImageDescribeResult =
  | { readonly entityId: string; readonly status: "described" | "kept" }
  | { readonly success: false; readonly error: string };

/** Words that leave a cut sentence hanging when it ends on them. */
const DANGLING_WORD =
  /\s+(?:and|or|but|nor|with|without|of|in|on|at|to|for|from|by|amid|among|beside|near|under|over|into|onto|a|an|the)$/i;

/** Whether the text ends on a word that leaves it hanging. */
export function endsHanging(text: string): boolean {
  return DANGLING_WORD.test(text.replace(/[\s,;:.–—-]+$/, ""));
}

/** The text without trailing punctuation or a word that leaves it hanging. */
export function withoutDanglingEnd(text: string): string {
  const trimmed = text.replace(/[\s,;:.–—-]+$/, "");
  return DANGLING_WORD.test(trimmed)
    ? withoutDanglingEnd(trimmed.replace(DANGLING_WORD, ""))
    : trimmed;
}

/**
 * The description within the limit: whole when it fits, else cut at its last
 * clause (a comma or semicolon past half the limit) or, without one, at a
 * word, never ending on a word that leaves it hanging.
 */
export function altTextFrom(description: string): string {
  const sentence = description.replace(/\s+/g, " ").trim();
  if (sentence.length <= ALT_TEXT_LIMIT) return sentence;
  const cut = sentence.slice(0, ALT_TEXT_LIMIT + 1);
  const lastClause = Math.max(cut.lastIndexOf(","), cut.lastIndexOf(";"));
  const lastSpace = cut.lastIndexOf(" ");
  const end =
    lastClause >= ALT_TEXT_LIMIT / 2
      ? lastClause
      : lastSpace > 0
        ? lastSpace
        : ALT_TEXT_LIMIT;
  return withoutDanglingEnd(cut.slice(0, end));
}

/**
 * Write an image's alt text from what the brain's image-reading model sees.
 * Alt text its owner wrote stays; an SVG, or a brain with no model that reads
 * images, keeps its fallback.
 */
export function describeImageJob(
  image: () => ImageDefinition,
): EntityJobDeclaration<typeof imageDescribeJobContract.input> {
  return contractJob(imageDescribeJobContract, {
    handle: async (context): Promise<ImageDescribeResult> => {
      const { imageId }: ImageDescribeJobInput = context.input;
      const runtime = entityRuntime(context);
      try {
        const stored = await runtime.assets.getStored(image(), imageId);
        if (!stored) return JobResult.failure(`No image ${imageId}`);
        const { metadata } = stored;
        if (
          metadata.altSource === "owner" ||
          metadata.format === "svg" ||
          !runtime.images.canDescribe()
        ) {
          return { entityId: imageId, status: "kept" };
        }
        const bytes = await runtime.assets.read(image(), imageId);
        const mediaType =
          metadata.mediaType ??
          (metadata.format ? imageMediaType(metadata.format) : undefined);
        if (!bytes || !mediaType) return { entityId: imageId, status: "kept" };

        const description = await runtime.images.describe(
          { bytes, mediaType },
          DESCRIBE_INSTRUCTION,
        );
        const alt = description ? altTextFrom(description) : "";
        if (!alt) return { entityId: imageId, status: "kept" };

        // Read again: the owner may have written alt text while the model
        // looked, and theirs stays.
        const current = await runtime.assets.getStored(image(), imageId);
        if (!current || current.metadata.altSource === "owner") {
          return { entityId: imageId, status: "kept" };
        }
        await context.entities.update(image(), current, {
          metadata: { ...current.metadata, alt, altSource: "generated" },
        });
        return { entityId: imageId, status: "described" };
      } catch (error) {
        runtime.logger.warn("Image description failed", { imageId, error });
        return JobResult.failure(error);
      }
    },
  });
}
