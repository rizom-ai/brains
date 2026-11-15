import { z } from "@brains/utils/zod";
import { baseEntitySchema } from "@brains/sdk/internal/entity-runtime";

type SwotItemSchema = z.ZodObject<{
  title: z.ZodString;
  detail: z.ZodOptional<z.ZodString>;
}>;

export const swotItemSchema: SwotItemSchema = z.object({
  title: z.string(),
  detail: z.string().optional(),
});

export type SwotItem = z.output<typeof swotItemSchema>;

type SwotFrontmatterSchema = z.ZodObject<{
  strengths: z.ZodDefault<z.ZodArray<SwotItemSchema>>;
  weaknesses: z.ZodDefault<z.ZodArray<SwotItemSchema>>;
  opportunities: z.ZodDefault<z.ZodArray<SwotItemSchema>>;
  threats: z.ZodDefault<z.ZodArray<SwotItemSchema>>;
  derivedAt: z.ZodString;
}>;

export const swotFrontmatterSchema: SwotFrontmatterSchema = z.object({
  strengths: z.array(swotItemSchema).default([]),
  weaknesses: z.array(swotItemSchema).default([]),
  opportunities: z.array(swotItemSchema).default([]),
  threats: z.array(swotItemSchema).default([]),
  derivedAt: z.string().datetime().meta({ studioWidget: "provenance" }),
});

export type SwotFrontmatter = z.output<typeof swotFrontmatterSchema>;

type SwotMetadataSchema = z.ZodObject<{
  derivedAt: z.ZodString;
}>;

export const swotMetadataSchema: SwotMetadataSchema =
  swotFrontmatterSchema.pick({
    derivedAt: true,
  });

export type SwotMetadata = z.output<typeof swotMetadataSchema>;

export const swotEntitySchema: ReturnType<
  typeof baseEntitySchema.extend<{
    entityType: z.ZodLiteral<"swot">;
    metadata: SwotMetadataSchema;
  }>
> = baseEntitySchema.extend({
  entityType: z.literal("swot"),
  metadata: swotMetadataSchema,
});

export type SwotEntity = z.output<typeof swotEntitySchema>;
