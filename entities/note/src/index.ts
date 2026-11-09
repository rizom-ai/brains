import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { noteConfigSchema } from "./config";
import { note } from "./note";

/**
 * The notes: one entity, a free-form markdown note, with the package's
 * settings as the note plugin class took them.
 */
export const notePackage: EntityPackageDefinition<
  readonly [typeof note],
  readonly [],
  typeof noteConfigSchema
> = defineEntityPackage({
  id: "note",
  config: noteConfigSchema,
  entities: [note],
});

export default notePackage;

export { note } from "./note";
export { buildNoteAtprotoRecord, noteAtproto } from "./atproto-projection";

// Schema exports
export {
  noteSchema,
  noteFrontmatterSchema,
  noteMetadataSchema,
  noteWithDataSchema,
  type Note,
  type NoteFrontmatter,
  type NoteMetadata,
  type NoteStatus,
  type NoteWithData,
} from "./schemas/note";

// Config exports
export {
  noteConfigSchema,
  type NoteConfig,
  type NoteConfigInput,
} from "./config";

export {
  noteGeneration,
  noteGenerationJobSchema,
  generatedNoteSchema,
  type NoteGenerationJobData,
} from "./generation";
export {
  uploadMarkdownImportJobContract,
  uploadMarkdownImportJobSchema,
  type UploadMarkdownImportJobData,
  type UploadMarkdownImportJobResult,
} from "./jobs/upload-import";

// Template exports
export {
  noteGenerationTemplate,
  noteGenerationSchema,
  type NoteGeneration,
} from "./templates/generation-template";
