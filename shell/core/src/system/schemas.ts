import { canonicalContentVisibilitySchema } from "@brains/entity-service";
import { z } from "@brains/utils/zod";

type StrictObjectSchema<Shape extends z.ZodRawShape> = ReturnType<
  z.ZodObject<Shape>["strict"]
>;

// ── Input schemas ──

type SearchScopeInputSchema = z.ZodDiscriminatedUnion<
  [
    StrictObjectSchema<{ kind: z.ZodLiteral<"all"> }>,
    StrictObjectSchema<{
      kind: z.ZodLiteral<"type">;
      entityType: z.ZodString;
    }>,
  ],
  "kind"
>;

const searchScopeInputSchema: SearchScopeInputSchema = z.discriminatedUnion(
  "kind",
  [
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
  ],
);

export const searchInputSchema: z.ZodObject<{
  query: z.ZodString;
  scope: typeof searchScopeInputSchema;
  limit: z.ZodOptional<z.ZodNumber>;
  minScore: z.ZodOptional<z.ZodNumber>;
  includeUngenerated: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  query: z.string().describe("Search term"),
  scope: searchScopeInputSchema.describe(
    "Structured search scope. Use { kind: 'all' } for broad search across all entity types. Use { kind: 'type', entityType } only when the user asks for a specific entity type.",
  ),
  limit: z.number().optional().describe("Maximum number of results"),
  minScore: z
    .number()
    .min(0)
    .optional()
    .describe(
      "Minimum relevance score. Default is 0.5; lower it only for exploratory or loose recall when weak candidates are acceptable.",
    ),
  includeUngenerated: z
    .boolean()
    .optional()
    .describe("Include queued/failed generation stubs in results"),
});

export const getInputSchema: z.ZodObject<{
  entityType: z.ZodString;
  id: z.ZodString;
}> = z.object({
  entityType: z.string().describe("Entity type"),
  id: z.string().describe("Entity ID, slug, or title"),
});

export const listInputSchema: z.ZodObject<{
  entityType: z.ZodString;
  status: z.ZodOptional<z.ZodString>;
  limit: z.ZodOptional<z.ZodNumber>;
}> = z.object({
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

const createUploadInputSchema: z.ZodObject<{
  kind: z.ZodLiteral<"upload">;
  id: z.ZodString;
}> = z.object({
  kind: z.literal("upload").describe("Upload ref kind"),
  id: z.string().min(1).describe("Upload ID"),
});

const createUserMessageSourceInputSchema: StrictObjectSchema<{
  kind: z.ZodLiteral<"user-message">;
  messageId: z.ZodOptional<z.ZodString>;
  boundaryMode: z.ZodOptional<
    z.ZodEnum<{ literal: "literal"; lines: "lines" }>
  >;
  startAfter: z.ZodOptional<z.ZodString>;
  endBefore: z.ZodOptional<z.ZodString>;
  contentHash: z.ZodOptional<z.ZodString>;
}> = z
  .object({
    kind: z
      .literal("user-message")
      .describe(
        "Save verbatim text already supplied by the user. The server reads the stored message; do not copy its body into tool arguments.",
      ),
    messageId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Stored user message ID in this conversation; omit for the latest user message.",
      ),
    boundaryMode: z
      .enum(["literal", "lines"])
      .optional()
      .describe(
        "Use lines for standalone delimiter lines: supply marker text without newline characters. The server excludes the opening line and its line ending, and stops at the start of the closing line, preserving every byte between them, including final newlines. Omit or use literal for inline text boundaries.",
      ),
    startAfter: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Exact unique opening boundary, excluded from saved text. In lines mode, supply the whole marker line WITHOUT newline characters. In literal mode, supply the exact prefix to exclude. Omit to start at the beginning of the message.",
      ),
    endBefore: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Exact unique closing boundary, excluded from saved text. In lines mode, supply the whole marker line WITHOUT newline characters; preceding content newlines are preserved. In literal mode, supply the exact suffix to exclude. Omit to end at the end of the message.",
      ),
    contentHash: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Internal source hash returned with the confirmation; omit on the initial request.",
      ),
  })
  .strict();

export const createPreferredSourceInputSchema: z.ZodDiscriminatedUnion<
  [
    StrictObjectSchema<{
      kind: z.ZodLiteral<"text">;
      content: z.ZodString;
    }>,
    typeof createUserMessageSourceInputSchema,
    StrictObjectSchema<{
      kind: z.ZodLiteral<"url">;
      url: z.ZodString;
    }>,
    StrictObjectSchema<{
      kind: z.ZodLiteral<"upload">;
      upload: typeof createUploadInputSchema;
      transform: z.ZodEnum<{
        "extract-markdown": "extract-markdown";
        preserve: "preserve";
      }>;
    }>,
    StrictObjectSchema<{
      kind: z.ZodLiteral<"prior-response">;
      messageId: z.ZodOptional<z.ZodString>;
    }>,
  ],
  "kind"
> = z.discriminatedUnion("kind", [
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
          "Literal content for a direct save request without a stored user-message source. For pasted text already in this conversation, prefer source.kind user-message with exact boundaries instead of reproducing the body here.",
        ),
    })
    .strict(),
  createUserMessageSourceInputSchema,
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

type EntityRefInputSchema = StrictObjectSchema<{
  entityType: z.ZodString;
  entityId: z.ZodString;
}>;

type GenerateOperationInputSchema = z.ZodDiscriminatedUnion<
  [
    StrictObjectSchema<{
      kind: z.ZodLiteral<"prompt">;
      entityType: z.ZodString;
      title: z.ZodOptional<z.ZodString>;
      prompt: z.ZodString;
    }>,
    StrictObjectSchema<{
      kind: z.ZodLiteral<"prompt-from-source">;
      entityType: z.ZodString;
      title: z.ZodOptional<z.ZodString>;
      source: EntityRefInputSchema;
      prompt: z.ZodString;
    }>,
    StrictObjectSchema<{
      kind: z.ZodLiteral<"standalone-image">;
      title: z.ZodOptional<z.ZodString>;
      prompt: z.ZodString;
    }>,
    StrictObjectSchema<{
      kind: z.ZodLiteral<"cover-image">;
      target: EntityRefInputSchema;
      title: z.ZodOptional<z.ZodString>;
      prompt: z.ZodString;
    }>,
    StrictObjectSchema<{
      kind: z.ZodLiteral<"attachment">;
      source: EntityRefInputSchema;
      attachmentType: z.ZodString;
      title: z.ZodOptional<z.ZodString>;
      replace: z.ZodOptional<z.ZodBoolean>;
    }>,
  ],
  "kind"
>;

export const generateOperationInputSchema: GenerateOperationInputSchema =
  z.discriminatedUnion("kind", [
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
        prompt: z
          .string()
          .min(1)
          .describe("Prompt for creating the cover image"),
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
        title: z
          .string()
          .optional()
          .describe("Title for the generated artifact"),
        replace: z
          .boolean()
          .optional()
          .describe(
            "Set true for regenerate, replace, refresh, or update requests so a deterministic artifact is regenerated instead of reused",
          ),
      })
      .strict(),
  ]);

export const createInputSchema: StrictObjectSchema<{
  entityType: z.ZodString;
  title: z.ZodOptional<z.ZodString>;
  visibility: z.ZodOptional<typeof canonicalContentVisibilitySchema>;
  source: typeof createPreferredSourceInputSchema;
  replace: z.ZodOptional<z.ZodBoolean>;
  confirmed: z.ZodOptional<z.ZodLiteral<true>>;
  confirmationToken: z.ZodOptional<z.ZodString>;
}> = z
  .object({
    entityType: z
      .string()
      .describe(
        "Entity type to create. Use wish for explicitly saved or tracked unmet requested capabilities or outcomes.",
      ),
    title: z.string().optional().describe("Title for a new entity."),
    visibility: canonicalContentVisibilitySchema
      .optional()
      .describe(
        "Content visibility. Omit for public. Use shared for team/collaborator content readable by Trusted and Admin callers. Use restricted for private/admin-only content.",
      ),
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

export const generateInputSchema: StrictObjectSchema<{
  operation: typeof generateOperationInputSchema;
  confirmed: z.ZodOptional<z.ZodLiteral<true>>;
  confirmationToken: z.ZodOptional<z.ZodString>;
}> = z
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

export const contentEditSchema: z.ZodObject<{
  oldText: z.ZodString;
  newText: z.ZodString;
}> = z
  .object({
    oldText: z
      .string()
      .min(1)
      .describe(
        "Exact text occurring once in the original stored Markdown. Include enough context to be unique.",
      ),
    newText: z
      .string()
      .describe("Literal replacement text; empty string deletes oldText."),
  })
  .strict();

export type ContentEdit = z.output<typeof contentEditSchema>;

export const updateInputSchema: z.ZodObject<{
  entityType: z.ZodString;
  id: z.ZodString;
  fields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  content: z.ZodOptional<z.ZodString>;
  edits: z.ZodOptional<z.ZodArray<typeof contentEditSchema>>;
  confirmed: z.ZodOptional<z.ZodLiteral<true>>;
  confirmationToken: z.ZodOptional<z.ZodString>;
  contentHash: z.ZodOptional<z.ZodString>;
}> = z.object({
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
      "Full markdown content replacement only. For small changes, use edits instead of regenerating the whole document. Do not combine content with edits or fields.",
    ),
  edits: z
    .array(contentEditSchema)
    .min(1)
    .max(50)
    .optional()
    .describe(
      "Preferred for small content edits, especially long notes. Exact, unique, non-overlapping replacements matched against the original Markdown, applied atomically after confirmation. Fetch the entity first. Omit content and fields when using edits. Unchanged text is preserved without regeneration.",
    ),
  confirmed: z.literal(true).optional().describe("Confirm the update"),
  confirmationToken: z
    .string()
    .optional()
    .describe("Internal confirmation token returned by the confirmation flow"),
  contentHash: z
    .string()
    .optional()
    .describe("Content hash for optimistic concurrency"),
});

export const deleteInputSchema: z.ZodObject<{
  entityType: z.ZodString;
  id: z.ZodString;
  confirmed: z.ZodOptional<z.ZodLiteral<true>>;
  confirmationToken: z.ZodOptional<z.ZodString>;
}> = z.object({
  entityType: z.string().describe("Entity type"),
  id: z.string().describe("Entity ID"),
  confirmed: z.literal(true).optional().describe("Confirm the deletion"),
  confirmationToken: z
    .string()
    .optional()
    .describe("Internal confirmation token returned by the confirmation flow"),
});

export const extractInputSchema: z.ZodObject<{
  entityType: z.ZodString;
  source: z.ZodOptional<z.ZodString>;
  mode: z.ZodOptional<z.ZodEnum<{ derive: "derive"; rebuild: "rebuild" }>>;
  confirmed: z.ZodOptional<z.ZodLiteral<true>>;
  confirmationToken: z.ZodOptional<z.ZodString>;
}> = z.object({
  entityType: z.string().describe("Entity type to extract"),
  source: z.string().optional().describe("Source entity ID — omit for batch"),
  mode: z
    .enum(["derive", "rebuild"])
    .optional()
    .describe("Batch mode: project incrementally or rebuild from scratch"),
  confirmed: z.literal(true).optional().describe("Confirm destructive rebuild"),
  confirmationToken: z
    .string()
    .optional()
    .describe("Internal confirmation token returned by the confirmation flow"),
});

export const jobStatusInputSchema: z.ZodObject<{
  batchId: z.ZodOptional<z.ZodString>;
  jobTypes: z.ZodOptional<z.ZodArray<z.ZodString>>;
}> = z.object({
  batchId: z.string().optional().describe("Specific batch ID to check"),
  jobTypes: z.array(z.string()).optional().describe("Filter by job types"),
});

export const insightsInputSchema: z.ZodObject<{
  type: z.ZodString;
}> = z.object({
  type: z
    .string()
    .describe(
      "Type of insight to retrieve. Built-in: overview, publishing-cadence, content-health. Plugins may register additional types.",
    ),
});

// ── Output schemas ──

const createResultAttachmentSourceSchema: z.ZodObject<{
  entityType: z.ZodOptional<z.ZodString>;
  entityId: z.ZodOptional<z.ZodString>;
  attachmentType: z.ZodOptional<z.ZodString>;
}> = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  attachmentType: z.string().optional(),
});

const createResultAttachmentSchema: z.ZodObject<{
  mediaType: z.ZodString;
  url: z.ZodString;
  downloadUrl: z.ZodOptional<z.ZodString>;
  previewUrl: z.ZodOptional<z.ZodString>;
  filename: z.ZodOptional<z.ZodString>;
  sizeBytes: z.ZodOptional<z.ZodNumber>;
  source: z.ZodOptional<typeof createResultAttachmentSourceSchema>;
}> = z.object({
  mediaType: z.string(),
  url: z.string(),
  downloadUrl: z.string().optional(),
  previewUrl: z.string().optional(),
  filename: z.string().optional(),
  sizeBytes: z.number().optional(),
  source: createResultAttachmentSourceSchema.optional(),
});

export const createOutputSchema: z.ZodObject<{
  entityId: z.ZodOptional<z.ZodString>;
  status: z.ZodEnum<{ created: "created"; generating: "generating" }>;
  jobId: z.ZodOptional<z.ZodString>;
  attachment: z.ZodOptional<typeof createResultAttachmentSchema>;
}> = z.object({
  entityId: z.string().optional(),
  status: z.enum(["created", "generating"]),
  jobId: z.string().optional(),
  attachment: createResultAttachmentSchema.optional(),
});

export const extractOutputSchema: z.ZodObject<{
  status: z.ZodLiteral<"extracting">;
  jobId: z.ZodString;
  entityType: z.ZodString;
  source: z.ZodOptional<z.ZodString>;
  mode: z.ZodOptional<z.ZodEnum<{ derive: "derive"; rebuild: "rebuild" }>>;
}> = z.object({
  status: z.literal("extracting"),
  jobId: z.string(),
  entityType: z.string(),
  source: z.string().optional(),
  mode: z.enum(["derive", "rebuild"]).optional(),
});
