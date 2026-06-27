import { createResultAttachmentSchema } from "@brains/entity-service";
import { z } from "@brains/utils";

// ── Input schemas ──

const searchScopeInputSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("all") })
    .strict()
    .describe("Search across all entity types"),
  z
    .object({
      kind: z.literal("type"),
      entityType: z.string().min(1).describe("Entity type to search"),
    })
    .strict()
    .describe("Search within one entity type"),
]);

export const searchInputSchema = z.object({
  query: z.string().describe("Search term"),
  scope: searchScopeInputSchema.describe(
    "Structured search scope. Use { kind: 'all' } for broad search across all entity types. Use { kind: 'type', entityType } only when the user asks for a specific entity type.",
  ),
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
  status: z
    .string()
    .optional()
    .describe(
      "Filter by status. Omit unless the user asks for a known status; do not invent generic statuses. For wish statuses: new, planned, in-progress, done, declined.",
    ),
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

const createUploadInputSchema = z.object({
  kind: z.literal("upload").describe("Upload ref kind"),
  id: z.string().min(1).describe("Upload ID"),
});

export const createPreferredSourceInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z
        .literal("text")
        .describe(
          "Store exact/direct user-provided content without generation",
        ),
      content: z
        .string()
        .min(1)
        .describe(
          "Exact markdown/text/content to persist as provided. For direct save requests where the user includes the content in the same message, use that provided content directly.",
        ),
    })
    .strict(),
  z
    .object({
      kind: z
        .literal("generate")
        .describe(
          "Generate new entity content or standalone image content from a prompt. This creates new durable content; do not use it to describe, analyze, or discuss an existing uploaded file.",
        ),
      prompt: z
        .string()
        .min(1)
        .describe(
          "Prompt for creating new generated content. This is sufficient for standalone generated images/content; no target fields are needed unless attaching to an existing parent entity. Not for summarizing or describing existing uploads.",
        ),
    })
    .strict(),
  z
    .object({
      kind: z
        .literal("url")
        .describe("Create URL/domain-backed entities such as links"),
      url: z
        .string()
        .min(1)
        .describe(
          "URL or domain to create from; preserve a bare domain as provided instead of adding a scheme.",
        ),
    })
    .strict(),
  z
    .object({
      kind: z
        .literal("upload")
        .describe(
          "Extract markdown/text from an upload into a note entity only; do not use for raw document/image file preservation",
        ),
      upload: createUploadInputSchema.describe(
        "Exact upload candidate object to extract from",
      ),
      transform: z
        .literal("extract-markdown")
        .describe(
          "Required transform for upload-to-note extraction. Use system_upload_save instead when saving the raw uploaded file as a document or image.",
        ),
    })
    .strict(),
  z
    .object({
      kind: z
        .literal("attachment")
        .describe(
          "Create saved deterministic artifacts from existing entities. Use this branch for requests to save or regenerate durable PDF document entities such as deck carousel PDFs or post/project printable PDFs, and for OG/social preview images.",
        ),
      sourceEntityType: z.string().min(1).describe("Source entity type"),
      sourceEntityId: z
        .string()
        .min(1)
        .describe("Canonical source entity ID, not a title"),
      attachmentType: z
        .string()
        .min(1)
        .describe(
          'Source artifact type such as "carousel", "printable", or "og-image"',
        ),
    })
    .strict(),
  z
    .object({
      kind: z
        .literal("prior-response")
        .describe("Save a previous assistant response as durable content"),
      messageId: z
        .string()
        .min(1)
        .optional()
        .describe("Stored assistant message ID; omit for latest savable"),
    })
    .strict(),
]);

export const uploadSaveInputSchema = z.object({
  upload: createUploadInputSchema.describe(
    'Exact upload ref to save, copied from the current message or conversation upload refs hint, e.g. { kind: "upload", id: "upload-..." }.',
  ),
  title: z.string().optional().describe("Optional title for the saved file"),
  confirmed: z.literal(true).optional().describe("Confirm the upload save"),
  confirmationToken: z
    .string()
    .optional()
    .describe("Internal confirmation token returned by the confirmation flow"),
});

export const createInputSchema = z
  .object({
    entityType: z
      .string()
      .describe(
        "Entity type to create. Use wish for explicitly saved or tracked unmet requested capabilities or outcomes.",
      ),
    title: z.string().optional().describe("Title for a new entity."),
    source: createPreferredSourceInputSchema.describe(
      "Canonical source selector. Use exactly one source branch.",
    ),
    replace: z
      .boolean()
      .optional()
      .describe(
        "Force regeneration instead of reusing a deterministic artifact",
      ),
    coverImage: coverImageInputSchema
      .optional()
      .describe(
        "For creating a new entity with a cover image in the same request. Omit targetEntityType/targetEntityId in this same-new-entity case.",
      ),
    confirmed: z.literal(true).optional().describe("Confirm the creation"),
    confirmationToken: z
      .string()
      .optional()
      .describe(
        "Internal confirmation token returned by the confirmation flow",
      ),
    targetEntityType: z
      .string()
      .min(1)
      .optional()
      .describe(
        "OMIT unless the created artifact should be attached to a different already-existing canonical entity. This is the existing parent entity type, not the type being created. Omit for standalone creates and when coverImage belongs to the new entity being created. Never use with placeholder or future entities.",
      ),
    targetEntityId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "OMIT unless the created artifact should be attached to a different already-existing canonical entity. This is the existing parent entity ID, not the new entity ID. Never use placeholder IDs such as temp, draft, or a guessed future slug.",
      ),
  })
  .strict();

export const updateInputSchema = z.object({
  entityType: z.string().describe("Entity type"),
  id: z.string().describe("Entity ID, slug, or title"),
  fields: z
    .record(z.unknown())
    .optional()
    .describe(
      "Partial frontmatter fields to update. Use this for status, title, and metadata changes such as approving an agent. Do not use fields for anchor-profile; anchor-profile updates require full markdown content replacement via content.",
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

export const jobStatusInputSchema = z.object({
  batchId: z.string().optional().describe("Specific batch ID to check"),
  jobTypes: z.array(z.string()).optional().describe("Filter by job types"),
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
