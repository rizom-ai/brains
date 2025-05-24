import { z } from "zod";

/**
 * Default query response schema used when no specific schema is provided
 * This ensures consistent structure across different query interfaces
 */
export const defaultQueryResponseSchema = z.object({
  answer: z.string(),
  summary: z.string().optional(),
  topics: z.array(z.string()).optional(),
  entities: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        title: z.string(),
        relevance: z.number().min(0).max(1).optional(),
      }),
    )
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type DefaultQueryResponse = z.infer<typeof defaultQueryResponseSchema>;

/**
 * Simple text response schema for basic queries
 */
export const simpleTextResponseSchema = z.object({
  answer: z.string(),
});

export type SimpleTextResponse = z.infer<typeof simpleTextResponseSchema>;

/**
 * Schema for entity creation responses
 */
export const createEntityResponseSchema = z.object({
  success: z.boolean(),
  entityId: z.string().optional(),
  message: z.string(),
});

export type CreateEntityResponse = z.infer<typeof createEntityResponseSchema>;

/**
 * Schema for entity update responses
 */
export const updateEntityResponseSchema = z.object({
  success: z.boolean(),
  entityId: z.string(),
  changes: z.array(z.string()).optional(),
  message: z.string(),
});

export type UpdateEntityResponse = z.infer<typeof updateEntityResponseSchema>;
