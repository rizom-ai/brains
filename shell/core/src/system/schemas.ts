import { createResultAttachmentSchema } from "@brains/entity-service";
import { z } from "@brains/utils";

// ── Input schemas ──

export const searchInputSchema = z.object({
  query: z.string().describe("Search term"),
  entityType: z.string().optional().describe("Entity type to filter by"),
  limit: z.number().optional().describe("Maximum number of results"),
  includeUngenerated: z
    .boolean()
    .optional()
    .describe("Include queued/failed generation stubs in results"),
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

const coverImageInputSchema = z.union([
  z.object({
    generate: z
      .literal(true)
      .describe("Set to true when the user asks for a cover image"),
    prompt: z.string().optional().describe("Prompt for cover image generation"),
  }),
  z.literal(true).describe("Set to true when the user asks for a cover image"),
  z.literal(false).describe("Do not generate a cover image"),
]);

const createSourceAttachmentInputSchema = z.object({
  sourceEntityType: z.string().min(1).describe("Source entity type"),
  sourceEntityId: z.string().min(1).describe("Source entity ID"),
  attachmentType: z.string().min(1).describe("Source attachment type"),
});

const createUploadInputSchema = z.object({
  kind: z.literal("upload").describe("Upload ref kind"),
  id: z.string().min(1).describe("Upload ID"),
});

export const createInputSchema = z.object({
  entityType: z
    .string()
    .describe(
      "Entity type to create. Do not use system_create for status-only requests such as making an existing post a draft; use system_update instead.",
    ),
  title: z
    .string()
    .optional()
    .describe(
      "Title for a new entity. Do not invent placeholder titles like 'Draft Post' unless the user explicitly asked to create a new post.",
    ),
  prompt: z
    .string()
    .optional()
    .describe(
      "Prompt for AI generation of a new entity. Do not use for finalized/exact/as-written content, and do not use for status changes like 'make one draft' or 'change it to draft'.",
    ),
  content: z
    .string()
    .optional()
    .describe(
      "Direct content to store. Use this for finalized/exact/as-written user-provided markdown, including deck markdown with frontmatter and slide separators; omit prompt in those cases.",
    ),
  url: z
    .string()
    .optional()
    .describe(
      "URL or domain for URL-first create flows such as saving a link or remote agent",
    ),
  upload: createUploadInputSchema
    .optional()
    .describe(
      'Promote an upload. Use only when the user asks to act on an uploaded file and this model turn shows an exact upload ref in the current message or conversation upload refs hint, e.g. { kind: "upload", id: "upload-..." }. For raw uploaded PDFs use entityType "document" with no transform; for raw uploaded images use entityType "image" with no transform. Omit for ordinary direct creates that use content, prompt, url, or sourceAttachment. Never combine upload with sourceAttachment.',
    ),
  transform: z
    .string()
    .optional()
    .describe(
      'Optional upload transform. Set to exactly "extract-markdown" only with upload and entityType base to extract markdown/text from an uploaded text or PDF file into a markdown note. Omit for raw file promotion to document/image; never include transform with entityType document or image.',
    ),
  sourceAttachment: createSourceAttachmentInputSchema
    .optional()
    .describe(
      "Create from a source-derived entity artifact such as a deck carousel or post printable PDF. Use this instead of upload when the requested source is an existing entity artifact. Omit upload when using sourceAttachment. Omit for ordinary direct creates that use content, prompt, or url.",
    ),
  replace: z
    .boolean()
    .optional()
    .describe("Force regeneration instead of reusing a deterministic artifact"),
  targetEntityType: z
    .string()
    .optional()
    .describe(
      "Existing entity type to attach to after creation. Use only when the user explicitly asks to set/replace a cover or attach the artifact to an existing entity; omit for standalone image/document generation.",
    ),
  targetEntityId: z
    .string()
    .optional()
    .describe(
      "Existing entity ID to attach to after creation. Use only with targetEntityType; omit for standalone image/document generation.",
    ),
  coverImage: coverImageInputSchema
    .optional()
    .describe(
      "For creating a new entity with a cover image in the same request. Use { generate: true, prompt } or true. Do not make a separate image create call for the new entity.",
    ),
  confirmed: z.literal(true).optional().describe("Confirm the creation"),
  confirmationToken: z
    .string()
    .optional()
    .describe("Internal confirmation token returned by the confirmation flow"),
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
  confirmationToken: z
    .string()
    .optional()
    .describe("Internal confirmation token returned by the confirmation flow"),
});

export const extractInputSchema = z.object({
  entityType: z.string().describe("Entity type to extract"),
  source: z.string().optional().describe("Source entity ID — omit for batch"),
  mode: z
    .enum(["derive", "rebuild"])
    .optional()
    .describe("Batch mode: project incrementally or rebuild from scratch"),
  confirmed: z.literal(true).optional().describe("Confirm destructive rebuild"),
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
  attachment: createResultAttachmentSchema.optional(),
});

export const extractOutputSchema = z.object({
  status: z.literal("extracting"),
  jobId: z.string(),
  entityType: z.string(),
  source: z.string().optional(),
  mode: z.enum(["derive", "rebuild"]).optional(),
});
