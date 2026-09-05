import { z } from "@brains/utils/zod";

/**
 * Query response schemas used throughout the system
 */
type DefaultQuerySourceSchema = z.ZodObject<{
  id: z.ZodString;
  type: z.ZodString;
  excerpt: z.ZodOptional<z.ZodString>;
  relevance: z.ZodOptional<z.ZodNumber>;
}>;

type DefaultQueryResponseSchema = z.ZodObject<{
  message: z.ZodString;
  summary: z.ZodOptional<z.ZodString>;
  topics: z.ZodOptional<z.ZodArray<z.ZodString>>;
  sources: z.ZodOptional<z.ZodArray<DefaultQuerySourceSchema>>;
  metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}>;

export const defaultQueryResponseSchema: DefaultQueryResponseSchema = z
  .object({
    message: z.string().describe("Natural language response to the query"),
    summary: z.string().optional().describe("Brief summary if applicable"),
    topics: z.array(z.string()).optional().describe("Related topics mentioned"),
    sources: z
      .array(
        z.object({
          id: z.string(),
          type: z.string(),
          excerpt: z.string().optional(),
          relevance: z.number().min(0).max(1).optional(),
        }),
      )
      .optional()
      .describe("Source entities used to answer the query"),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .describe("defaultQueryResponse");

export type DefaultQueryResponse = z.output<typeof defaultQueryResponseSchema>;
export type DefaultQuerySource = z.output<DefaultQuerySourceSchema>;

type SimpleTextResponseSchema = z.ZodObject<{ message: z.ZodString }>;

export const simpleTextResponseSchema: SimpleTextResponseSchema = z
  .object({
    message: z.string(),
  })
  .describe("simpleTextResponse");

export type SimpleTextResponse = z.output<typeof simpleTextResponseSchema>;

type CreateEntityResponseSchema = z.ZodObject<{
  success: z.ZodBoolean;
  entityId: z.ZodOptional<z.ZodString>;
  message: z.ZodString;
}>;

export const createEntityResponseSchema: CreateEntityResponseSchema = z
  .object({
    success: z.boolean(),
    entityId: z.string().optional(),
    message: z.string(),
  })
  .describe("createEntityResponse");

export type CreateEntityResponse = z.output<typeof createEntityResponseSchema>;

type UpdateEntityResponseSchema = z.ZodObject<{
  success: z.ZodBoolean;
  entityId: z.ZodString;
  changes: z.ZodOptional<z.ZodArray<z.ZodString>>;
  message: z.ZodString;
}>;

export const updateEntityResponseSchema: UpdateEntityResponseSchema = z
  .object({
    success: z.boolean(),
    entityId: z.string(),
    changes: z.array(z.string()).optional(),
    message: z.string(),
  })
  .describe("updateEntityResponse");

export type UpdateEntityResponse = z.output<typeof updateEntityResponseSchema>;
