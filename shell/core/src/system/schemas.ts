import { z } from "@brains/utils";

// ── Input schemas ──

export const searchInputSchema = z.object({
  query: z.string().describe("Search term"),
  entityType: z.string().optional().describe("Entity type to filter by"),
  limit: z.number().optional().describe("Maximum number of results"),
});

export const getInputSchema = z.object({
  entityType: z.string().describe("Entity type"),
  id: z.string().describe("Entity ID, slug, or title"),
});

export const listInputSchema = z.object({
  entityType: z.string().describe("Entity type to list"),
  status: z.string().optional().describe("Filter by status"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of results (default: 20)"),
});

export const createInputSchema = z.object({
  entityType: z.string().describe("Entity type to create"),
  title: z.string().optional().describe("Title for the entity"),
  prompt: z.string().optional().describe("Prompt for AI generation"),
  content: z.string().optional().describe("Direct content to store"),
  url: z
    .string()
    .optional()
    .describe(
      "URL or domain for URL-first create flows such as saving a link or remote agent",
    ),
  targetEntityType: z
    .string()
    .optional()
    .describe(
      "Attach to this entity type after creation (e.g. set as cover image)",
    ),
  targetEntityId: z
    .string()
    .optional()
    .describe("Attach to this entity ID after creation"),
});

export const updateInputSchema = z.object({
  entityType: z.string().describe("Entity type"),
  id: z.string().describe("Entity ID"),
  fields: z
    .record(z.unknown())
    .optional()
    .describe(
      "Partial frontmatter fields to update. Use this for status, title, and metadata changes such as approving an agent.",
    ),
  content: z
    .string()
    .optional()
    .describe(
      "Full markdown content replacement only. Do not use this for status/title/frontmatter updates; use fields instead.",
    ),
  confirmed: z.literal(true).optional().describe("Confirm the update"),
  contentHash: z
    .string()
    .optional()
    .describe("Content hash for optimistic concurrency"),
});

export const deleteInputSchema = z.object({
  entityType: z.string().describe("Entity type"),
  id: z.string().describe("Entity ID"),
  confirmed: z.literal(true).optional().describe("Confirm the deletion"),
});

export const extractInputSchema = z.object({
  entityType: z.string().describe("Entity type to extract"),
  source: z.string().optional().describe("Source entity ID — omit for batch"),
  mode: z
    .enum(["derive", "rebuild"])
    .optional()
    .describe("Batch mode: derive incrementally or rebuild from scratch"),
  confirmed: z.literal(true).optional().describe("Confirm destructive rebuild"),
});

export const setCoverInputSchema = z.object({
  entityType: z.string().describe("Entity type"),
  entityId: z.string().describe("Entity ID or slug"),
  imageId: z.string().nullable().describe("Image ID to set, or null to remove"),
});

export const checkJobStatusInputSchema = z.object({
  batchId: z.string().optional().describe("Specific batch ID to check"),
  jobTypes: z.array(z.string()).optional().describe("Filter by job types"),
});

export const getConversationInputSchema = z.object({
  conversationId: z.string().describe("Conversation ID"),
});

export const listConversationsInputSchema = z.object({
  searchQuery: z.string().optional().describe("Optional search query"),
  limit: z.number().optional().describe("Maximum results (default: 20)"),
});

export const getMessagesInputSchema = z.object({
  conversationId: z.string().describe("Conversation ID"),
  limit: z.number().optional().describe("Maximum messages (default: 20)"),
});

export const insightsInputSchema = z.object({
  type: z
    .string()
    .describe(
      "Type of insight to retrieve. Built-in: overview, publishing-cadence, content-health. Plugins may register additional types.",
    ),
});

// ── Output schemas ──

export const createOutputSchema = z.object({
  entityId: z.string().optional(),
  status: z.enum(["created", "generating"]),
  jobId: z.string().optional(),
});

export const extractOutputSchema = z.object({
  status: z.literal("extracting"),
  jobId: z.string(),
  entityType: z.string(),
  source: z.string().optional(),
  mode: z.enum(["derive", "rebuild"]).optional(),
});

export const setCoverOutputSchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
  imageId: z.string().nullable(),
});
