import { z } from "zod";

/**
 * Query response schemas used throughout the system
 */
export const defaultQueryResponseSchema = z
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
    metadata: z.record(z.unknown()).optional(),
  })
  .describe("defaultQueryResponse");

export type DefaultQueryResponse = z.infer<typeof defaultQueryResponseSchema>;

export const simpleTextResponseSchema = z
  .object({
    message: z.string(),
  })
  .describe("simpleTextResponse");

export type SimpleTextResponse = z.infer<typeof simpleTextResponseSchema>;

export const createEntityResponseSchema = z
  .object({
    success: z.boolean(),
    entityId: z.string().optional(),
    message: z.string(),
  })
  .describe("createEntityResponse");

export type CreateEntityResponse = z.infer<typeof createEntityResponseSchema>;

export const updateEntityResponseSchema = z
  .object({
    success: z.boolean(),
    entityId: z.string(),
    changes: z.array(z.string()).optional(),
    message: z.string(),
  })
  .describe("updateEntityResponse");

export type UpdateEntityResponse = z.infer<typeof updateEntityResponseSchema>;
