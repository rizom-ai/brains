import type { BaseEntity } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { baseEntitySchema } from "@brains/plugins";

export interface SwotItem {
  title: string;
  detail?: string | undefined;
}

type SwotItemSchema = z.ZodObject<{
  title: z.ZodString;
  detail: z.ZodOptional<z.ZodString>;
}>;

export const swotItemSchema: SwotItemSchema = z.object({
  title: z.string(),
  detail: z.string().optional(),
});

export interface SwotFrontmatter {
  [key: string]: unknown;
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
  derivedAt: string;
}

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
  derivedAt: z.string().datetime(),
});

export interface SwotMetadata {
  [key: string]: unknown;
  derivedAt: string;
}

type SwotMetadataSchema = z.ZodObject<{
  derivedAt: z.ZodString;
}>;

export const swotMetadataSchema: SwotMetadataSchema =
  swotFrontmatterSchema.pick({
    derivedAt: true,
  });

export interface SwotEntity extends BaseEntity {
  entityType: "swot";
  metadata: SwotMetadata;
}

export const swotEntitySchema: ReturnType<
  typeof baseEntitySchema.extend<{
    entityType: z.ZodLiteral<"swot">;
    metadata: SwotMetadataSchema;
  }>
> = baseEntitySchema.extend({
  entityType: z.literal("swot"),
  metadata: swotMetadataSchema,
});
