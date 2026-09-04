import {
  defineEntity,
  ensureUniqueTitle,
  slugify,
  z,
  type EntityDefinition,
  type EntityGenerationJobDeclaration,
  type EntityGenerationResult,
} from "@brains/sdk/entities";
import { createNoteAtprotoProjection } from "./atproto-projection";
import {
  createNoteContent,
  titleFromBody,
  titleNeedsStoring,
} from "./lib/note-content";
import {
  extractMarkdownFromUpload,
  getMarkdownImportIdentity,
  isSupportedMarkdownUploadMediaType,
} from "./lib/upload-markdown-import";
import { noteFrontmatterSchema, noteMetadataSchema } from "./schemas/note";
import { noteGenerationTemplate } from "./templates/generation-template";

const generationInput = z.object({
  prompt: z.string(),
  title: z.string().optional(),
  entityId: z.string().optional(),
});

const uploadImportInput = z.object({
  uploadId: z.string(),
  entityId: z.string(),
  title: z.string().optional(),
});

const NOTE_INSTRUCTIONS =
  "Note entities are editable markdown notes. Use them for durable text " +
  "captures, summaries, and imported markdown; raw files remain document or " +
  "image entities instead of notes.";

/**
 * A short, free-form captured thought.
 *
 * A note is plain markdown the user may have written by hand, so the codec
 * is deliberately asymmetric: metadata always carries a title for listings
 * to show, but the file only stores one when reading it back would not
 * recover it.
 */
export const note: EntityDefinition<"note", typeof noteMetadataSchema> =
  defineEntity({
    type: "note",
    purpose:
      "A short, free-form captured thought, reference, or snippet the user wants to keep.",
    metadata: noteMetadataSchema,
    config: { projectionSourceRole: "primary" },
    markdown: {
      decode: ({ content, frontmatter }) => {
        const parsed = noteFrontmatterSchema.safeParse(frontmatter);
        const fields = parsed.success ? parsed.data : {};
        return {
          content,
          metadata: {
            title: fields.title ?? titleFromBody(content),
            ...(fields.status ? { status: fields.status } : {}),
            ...(fields.error ? { error: fields.error } : {}),
          },
        };
      },
      encode: ({ content, metadata }) => ({
        content,
        frontmatter: {
          ...(titleNeedsStoring(content, metadata.title)
            ? { title: metadata.title }
            : {}),
          ...(metadata.status ? { status: metadata.status } : {}),
          ...(metadata.error ? { error: metadata.error } : {}),
        },
      }),
    },
    stub: ({ title }) => ({
      content: `---\ntitle: ${title}\nstatus: generating\n---\n`,
      metadata: { title, status: "generating" as const },
    }),
    templates: { generation: noteGenerationTemplate },
    generation: {
      input: generationInput,
      generate: async ({
        input,
        ai,
        entities,
        logger,
        template,
      }): Promise<EntityGenerationResult> => {
        const generated = await ai.generate(
          {
            prompt: input.prompt,
            templateName: template("generation"),
            representedIdentity: "none",
          },
          z.object({ title: z.string(), body: z.string() }),
        );
        // A note's id is its slugified title, so two notes on one topic would
        // otherwise silently become one.
        const title = await ensureUniqueTitle({
          entityType: "note",
          title: input.title ?? generated.title,
          deriveId: slugify,
          regeneratePrompt:
            "Generate a different note title on the same topic.",
          context: { entityService: entities, ai, logger },
        });
        return {
          success: true,
          id: slugify(title),
          content: createNoteContent(title, generated.body),
          metadata: { title },
          resultExtras: { title },
        };
      },
    },
    jobs: {
      // Declared with `generate`, so the runtime writes what comes back and
      // marks the note failed if the import throws — the stub was allocated
      // before the job was queued and someone is already looking at it.
      "upload-import": {
        input: uploadImportInput,
        generate: async ({
          input,
          uploads,
        }): Promise<EntityGenerationResult> => {
          const upload = await uploads.read(input.uploadId);
          const imported = await extractMarkdownFromUpload({
            upload,
            ...(input.title !== undefined ? { title: input.title } : {}),
          });
          return {
            success: true,
            id: input.entityId,
            content: imported.content,
            metadata: { title: imported.title },
          };
        },
      } satisfies EntityGenerationJobDeclaration<typeof uploadImportInput>,
    },
    create: {
      // An upload is read into a note; a prompt is generated into one. Both
      // allocate first so the caller gets a real id straight away.
      fromUpload: {
        resolve: async ({ input, uploads }) => {
          if (input.transform !== "extract-markdown") {
            return {
              refuse:
                'Importing an upload as a note requires transform: "extract-markdown"',
            };
          }
          const from = input.from;
          if (from?.kind !== "upload") {
            return { refuse: "Upload ref not found" };
          }
          const uploadId = from.id;

          const record = await uploads.readRecord(uploadId).catch(() => null);
          if (!record) return { refuse: "Upload ref not found" };
          if (!isSupportedMarkdownUploadMediaType(record.mediaType)) {
            return {
              refuse:
                "Only text, JSON, and PDF uploads can be imported as markdown notes",
            };
          }

          const identity = getMarkdownImportIdentity({
            filename: record.filename,
            ...(input.title !== undefined ? { title: input.title } : {}),
          });
          return {
            create: {
              id: identity.id,
              content: `---\ntitle: ${identity.title}\nstatus: generating\n---\n`,
              metadata: { title: identity.title, status: "generating" },
            },
            delegate: {
              job: "upload-import",
              input: {
                uploadId,
                ...(input.title !== undefined ? { title: input.title } : {}),
              },
            },
          };
        },
      },
    },
    atproto: createNoteAtprotoProjection(),
    evals: {
      generateNote: async (input, { ai, template }) => {
        const parsed = z.object({ prompt: z.string() }).parse(input);
        return ai.generate(
          {
            prompt: parsed.prompt,
            templateName: template("generation"),
            representedIdentity: "none",
          },
          z.object({ title: z.string(), body: z.string() }),
        );
      },
    },
    instructions: NOTE_INSTRUCTIONS,
  });
