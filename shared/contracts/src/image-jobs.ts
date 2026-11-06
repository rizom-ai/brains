import { z } from "@brains/utils/zod";
import { defineJobContract, type JobContract } from "./job-contract";

type ImageAspectRatioSchema = z.ZodEnum<{
  "1:1": "1:1";
  "16:9": "16:9";
  "9:16": "9:16";
  "4:3": "4:3";
  "3:4": "3:4";
}>;

/** The aspect ratios the image service makes. */
export const imageAspectRatioSchema: ImageAspectRatioSchema = z.enum([
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
]);

export type ImageAspectRatio = z.output<typeof imageAspectRatioSchema>;

type ImageGenerateJobInputSchema = z.ZodObject<{
  prompt: z.ZodString;
  title: z.ZodOptional<z.ZodString>;
  aspectRatio: z.ZodOptional<ImageAspectRatioSchema>;
  targetEntityType: z.ZodOptional<z.ZodString>;
  targetEntityId: z.ZodOptional<z.ZodString>;
  entityTitle: z.ZodOptional<z.ZodString>;
  entityContent: z.ZodOptional<z.ZodString>;
}>;

export const imageGenerateJobInputSchema: ImageGenerateJobInputSchema =
  z.object({
    /** Text prompt for image generation (used directly when provided without entityContent) */
    prompt: z.string(),
    /** Title for the generated image (derived from prompt if omitted) */
    title: z.string().optional(),
    aspectRatio: imageAspectRatioSchema.optional(),
    /** Entity whose coverImageId the generated image becomes */
    targetEntityType: z.string().optional(),
    /** Required with targetEntityType */
    targetEntityId: z.string().optional(),
    /** Entity title for AI prompt distillation */
    entityTitle: z.string().optional(),
    /** Entity content for AI prompt distillation; its presence triggers distillation */
    entityContent: z.string().optional(),
  });

export type ImageGenerateJobInput = z.output<
  typeof imageGenerateJobInputSchema
>;

/** Generate an image from a prompt, optionally as another entity's cover. */
export const imageGenerateJobContract: JobContract<ImageGenerateJobInputSchema> =
  defineJobContract({
    type: "image:image-generate",
    input: imageGenerateJobInputSchema,
  });

type ImageRenderSourceJobInputSchema = z.ZodObject<{
  sourceEntityType: z.ZodString;
  sourceEntityId: z.ZodString;
  attachmentType: z.ZodString;
  imageId: z.ZodString;
  dedupKey: z.ZodOptional<z.ZodString>;
  replace: z.ZodOptional<z.ZodBoolean>;
  targetEntityType: z.ZodOptional<z.ZodString>;
  targetEntityId: z.ZodOptional<z.ZodString>;
  targetImageField: z.ZodOptional<
    z.ZodEnum<{ coverImageId: "coverImageId"; ogImageId: "ogImageId" }>
  >;
}>;

export const imageRenderSourceJobInputSchema: ImageRenderSourceJobInputSchema =
  z.object({
    sourceEntityType: z.string().min(1),
    sourceEntityId: z.string().min(1),
    attachmentType: z.string().min(1),
    imageId: z.string().min(1),
    dedupKey: z.string().min(1).optional(),
    replace: z.boolean().optional(),
    targetEntityType: z.string().min(1).optional(),
    targetEntityId: z.string().min(1).optional(),
    targetImageField: z.enum(["coverImageId", "ogImageId"]).optional(),
  });

export type ImageRenderSourceJobInput = z.output<
  typeof imageRenderSourceJobInputSchema
>;

/**
 * Render an image entity from another entity's image attachment, optionally
 * setting it as that entity's cover or OG image.
 */
export const imageRenderSourceJobContract: JobContract<ImageRenderSourceJobInputSchema> =
  defineJobContract({
    type: "image:image-render-source",
    input: imageRenderSourceJobInputSchema,
  });
