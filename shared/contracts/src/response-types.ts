import { z } from "@brains/utils/zod";

/**
 * Query response schemas used throughout the system
 */
export interface DefaultQuerySource {
  id: string;
  type: string;
  excerpt?: string | undefined;
  relevance?: number | undefined;
}

export interface DefaultQueryResponse {
  message: string;
  summary?: string | undefined;
  topics?: string[] | undefined;
  sources?: DefaultQuerySource[] | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface SimpleTextResponse {
  message: string;
}

export interface CreateEntityResponse {
  success: boolean;
  entityId?: string | undefined;
  message: string;
}

export interface UpdateEntityResponse {
  success: boolean;
  entityId: string;
  changes?: string[] | undefined;
  message: string;
}

export const defaultQueryResponseSchema: z.ZodType<
  DefaultQueryResponse,
  DefaultQueryResponse
> = z
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

export const simpleTextResponseSchema: z.ZodType<
  SimpleTextResponse,
  SimpleTextResponse
> = z
  .object({
    message: z.string(),
  })
  .describe("simpleTextResponse");

export const createEntityResponseSchema: z.ZodType<
  CreateEntityResponse,
  CreateEntityResponse
> = z
  .object({
    success: z.boolean(),
    entityId: z.string().optional(),
    message: z.string(),
  })
  .describe("createEntityResponse");

export const updateEntityResponseSchema: z.ZodType<
  UpdateEntityResponse,
  UpdateEntityResponse
> = z
  .object({
    success: z.boolean(),
    entityId: z.string(),
    changes: z.array(z.string()).optional(),
    message: z.string(),
  })
  .describe("updateEntityResponse");
