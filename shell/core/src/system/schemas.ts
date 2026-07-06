import { z } from "@brains/utils/zod";

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
          "Use extract-markdown to import upload text into a note, or preserve only when the user explicitly wants to save the uploaded file/document bytes themselves. Do not use for saving a previous assistant summary about an upload; use prior-response for that.",
        ),
      upload: createUploadInputSchema.describe(
        "Exact upload candidate object from the current conversation",
      ),
      transform: z
        .enum(["extract-markdown", "preserve"])
        .describe(
          "extract-markdown imports upload text into a note-like entity; preserve saves raw uploaded bytes via the registered upload-save handler and derives the durable entity type from media type. Use preserve only for explicit file/document preservation, not for saving an assistant summary response.",
        ),
    })
    .strict(),
  z
    .object({
      kind: z
        .literal("prior-response")
        .describe(
          "Save a previous assistant response as durable content, especially an assistant summary or answer about an upload.",
        ),
      messageId: z
        .string()
        .min(1)
        .optional()
        .describe("Stored assistant message ID; omit for latest savable"),
    })
    .strict(),
]);

export const generateOperationInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z
        .literal("prompt")
        .describe(
          "Generate a new non-image durable entity from a broad prompt with no durable source entity. Use this for general topical social/newsletter/blog/deck generation. This branch has no source field; use prompt-from-source only after resolving a specific existing content entity.",
        ),
      entityType: z
        .string()
        .min(1)
        .describe(
          "Entity type to generate from the prompt. Do not use image here; use standalone-image or cover-image.",
        ),
      title: z.string().optional().describe("Title for the generated entity"),
      prompt: z
        .string()
        .min(1)
        .describe(
          "Prompt for creating new generated content. Do not use for saving/importing existing uploads or prior responses.",
        ),
    })
    .strict(),
  z
    .object({
      kind: z
        .literal("prompt-from-source")
        .describe(
          "Generate a new non-image durable entity from a specific resolved existing content entity. Use when the user asks to generate from/based on a source, including requests like 'create a newsletter based on my latest blog post'. After resolving the source with a tool result, call this operation in the same turn; do not merely say you can generate it.",
        ),
      entityType: z
        .string()
        .min(1)
        .describe(
          "Entity type to generate from the source and prompt. Do not use image here; use standalone-image or cover-image.",
        ),
      title: z.string().optional().describe("Title for the generated entity"),
      source: z
        .object({
          entityType: z
            .string()
            .min(1)
            .describe(
              "Resolved content source entity type, such as post for a newsletter from a blog post. Do not use brain-character or anchor-profile.",
            ),
          entityId: z
            .string()
            .min(1)
            .describe(
              "Resolved source entity ID copied from a prior tool result or typed entity ref; never an upload id, filename, guessed slug, or future placeholder.",
            ),
        })
        .strict()
        .describe(
          "Existing durable source entity to ground this generation. Use only resolved entity refs, not uploads, filenames, profile/brain-character context, conversation-only context, unknown sources, or guessed sources.",
        ),
      prompt: z
        .string()
        .min(1)
        .describe(
          "Prompt for creating new generated content from the resolved source. Do not use for saving/importing existing uploads or prior responses.",
        ),
    })
    .strict(),
  z
    .object({
      kind: z
        .literal("standalone-image")
        .describe(
          "Generate a standalone image that is not attached to another entity. Do not use this as a cover image substitute; requested covers require cover-image after the target entity exists.",
        ),
      title: z.string().optional().describe("Title for the generated image"),
      prompt: z
        .string()
        .min(1)
        .describe(
          "Prompt for creating an unattached image. Not for cover images requested for a generated post/entity.",
        ),
    })
    .strict(),
  z
    .object({
      kind: z
        .literal("cover-image")
        .describe(
          "Generate an image and attach it to an existing entity as coverImageId. Use only after the target entity already exists and its real entityId is known; do not use in the same initial turn as generating that target entity.",
        ),
      target: z
        .object({
          entityType: z
            .string()
            .min(1)
            .describe(
              "Existing target entity type. Use the actual type of the entity being covered: social-post for LinkedIn/social posts, post for blog posts, etc.",
            ),
          entityId: z
            .string()
            .min(1)
            .describe(
              "Existing target entity ID copied from a prior tool result or typed entity ref; never a placeholder or guessed future id",
            ),
        })
        .strict()
        .describe(
          "Existing entity that should receive the generated coverImageId",
        ),
      title: z.string().optional().describe("Title for the generated image"),
      prompt: z.string().min(1).describe("Prompt for creating the cover image"),
    })
    .strict(),
  z
    .object({
      kind: z
        .literal("attachment")
        .describe(
          "Generate a deterministic durable artifact from an existing entity attachment provider",
        ),
      source: z
        .object({
          entityType: z.string().min(1).describe("Source entity type"),
          entityId: z
            .string()
            .min(1)
            .describe(
              "Canonical source entity ID copied from a prior tool result or typed entity ref; never an upload id, filename, guessed slug, or future placeholder",
            ),
        })
        .strict()
        .describe(
          "Existing durable entity whose attachment provider should render the artifact. Use only resolved entity refs, not uploads or conversation-only context.",
        ),
      attachmentType: z
        .string()
        .min(1)
        .describe(
          'Source artifact type such as "carousel", "printable", or "og-image"',
        ),
      title: z.string().optional().describe("Title for the generated artifact"),
      replace: z
        .boolean()
        .optional()
        .describe(
          "Set true for regenerate, replace, refresh, or update requests so a deterministic artifact is regenerated instead of reused",
        ),
    })
    .strict(),
]);

export const createInputSchema = z
  .object({
    entityType: z
      .string()
      .describe(
        "Entity type to create. Use wish for explicitly saved or tracked unmet requested capabilities or outcomes.",
      ),
    title: z.string().optional().describe("Title for a new entity."),
    source: createPreferredSourceInputSchema.describe(
      "Concrete source selector. Use exactly one source branch. For AI generation or source-derived artifacts, use system_generate instead.",
    ),
    replace: z.boolean().optional().describe("Create a new copy intentionally"),
    confirmed: z.literal(true).optional().describe("Confirm the creation"),
    confirmationToken: z
      .string()
      .optional()
      .describe(
        "Internal confirmation token returned by the confirmation flow",
      ),
  })
  .strict();

export const generateInputSchema = z
  .object({
    operation: generateOperationInputSchema.describe(
      "Generation operation selector. Use prompt for broad non-image AI-generated entities with no source, prompt-from-source for generation from a resolved existing entity, standalone-image for unattached images, cover-image for generated covers on existing entities, and attachment for deterministic source-derived artifacts; for regenerate/replace/refresh artifact requests use attachment with replace:true.",
    ),
    confirmed: z.literal(true).optional().describe("Confirm generation"),
    confirmationToken: z
      .string()
      .optional()
      .describe(
        "Internal confirmation token returned by the confirmation flow",
      ),
  })
  .strict();

export const updateInputSchema = z.object({
  entityType: z.string().describe("Entity type"),
  id: z.string().describe("Entity ID, slug, or title"),
  fields: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Partial frontmatter fields to update. Use this for status, title, coverImageId, ogImageId, and metadata changes such as approving an agent. To set an existing image as an entity cover, update fields.coverImageId to that image id. To remove or clear a cover image, set fields.coverImageId to null, not an empty string. Do not use fields for anchor-profile; anchor-profile updates require full markdown content replacement via content.",
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

const createResultAttachmentSchema = z.object({
  mediaType: z.string(),
  url: z.string(),
  downloadUrl: z.string().optional(),
  previewUrl: z.string().optional(),
  filename: z.string().optional(),
  sizeBytes: z.number().optional(),
  source: z
    .object({
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      attachmentType: z.string().optional(),
    })
    .optional(),
});

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
