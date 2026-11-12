import { noteFrontmatterSchema } from "./schemas/note";
import { noteCaptureContract } from "@brains/contracts";
import { defineEntity, z, type EntityDefinition } from "@brains/sdk/entities";
import {
  answering,
  entityAnswer,
  withFrontmatterSchema,
} from "@brains/sdk/internal/entity-runtime";
import { noteAtproto } from "./atproto-projection";
import { noteGeneration } from "./generation";
import { uploadImportJob } from "./jobs/upload-import";
import { noteFromUpload } from "./lib/create-from-upload";
import { noteMarkdown, noteTitle } from "./lib/note-markdown";
import { noteMetadataSchema } from "./schemas/note";
import { noteGenerationTemplate } from "./templates/generation-template";

const NOTE_INSTRUCTIONS =
  "Note entities are editable markdown notes. Use them for durable text captures, summaries, and imported markdown; raw files remain document or image entities instead of notes.";

type NoteDefinition = EntityDefinition<"note", typeof noteMetadataSchema>;

/**
 * A short, free-form captured thought: markdown the user may have written by
 * hand, its frontmatter its metadata. It is generated from a prompt,
 * imported from an upload, or captured for another package, always private.
 */
export const note: NoteDefinition = withFrontmatterSchema(
  answering(
    defineEntity({
      type: "note",
      purpose:
        "A short, free-form captured thought, reference, or snippet the user wants to keep.",
      metadata: noteMetadataSchema,
      markdown: noteMarkdown,
      config: { projectionSourceRole: "primary", markdownImport: true },
      instructions: NOTE_INSTRUCTIONS,
      // A stored note whose title is blank or the placeholder, unless the
      // file states it, is labeled from its body, without changing what is
      // stored.
      displayTitle: ({ content, metadata }) =>
        metadata.titleStated === true ||
        (metadata.title.trim() && metadata.title !== "Untitled")
          ? metadata.title
          : noteTitle(undefined, content),
      stub: ({ title }) => ({
        content: "",
        metadata: { title, status: "generating", titleStated: true },
      }),
      templates: { generation: noteGenerationTemplate },
      generation: noteGeneration,
      create: { fromUpload: noteFromUpload },
      jobs: { "upload-import": uploadImportJob(() => note) },
      evals: {
        generateNote: async (input, { ai }) =>
          ai.generate(
            {
              template: "generation",
              prompt: z.object({ prompt: z.string() }).parse(input).prompt,
              representedIdentity: "none",
            },
            z.object({ title: z.string(), body: z.string() }),
          ),
      },
      atproto: noteAtproto,
    }),
    [
      // Another plugin keeps text as a note; always private to the owner.
      entityAnswer(noteCaptureContract, async ({ request, entities }) => {
        const { id, title, body } = request;
        if (await entities.get(note, id)) return { noteId: id, created: false };
        await entities.create(note, {
          id,
          content: body,
          metadata: { title, titleStated: true },
          visibility: "restricted",
        });
        return { noteId: id, created: true };
      }),
    ],
  ),
  noteFrontmatterSchema,
);
