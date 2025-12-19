// Plugin exports
export { NotePlugin, notePlugin } from "./plugin";

// Schema exports
export {
  noteSchema,
  noteFrontmatterSchema,
  noteMetadataSchema,
  noteWithDataSchema,
  type Note,
  type NoteFrontmatter,
  type NoteMetadata,
  type NoteWithData,
} from "./schemas/note";

// Adapter exports
export { NoteAdapter, noteAdapter } from "./adapters/note-adapter";

// Config exports
export {
  noteConfigSchema,
  type NoteConfig,
  type NoteConfigInput,
} from "./config";

// Tool exports
export {
  createNoteTools,
  createInputSchema,
  generateInputSchema,
} from "./tools";

// Handler exports
export {
  NoteGenerationJobHandler,
  noteGenerationJobSchema,
  noteGenerationResultSchema,
  type NoteGenerationJobData,
  type NoteGenerationResult,
} from "./handlers/noteGenerationJobHandler";

// Template exports
export {
  noteGenerationTemplate,
  noteGenerationSchema,
  type NoteGeneration,
} from "./templates/generation-template";
