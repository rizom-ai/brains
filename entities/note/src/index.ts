/**
 * Note package.
 *
 * One entity and nothing else: a note is markdown the user owns, and both
 * ways of making one — generating from a prompt, importing an upload — fill
 * in an entity the runtime allocated first.
 */

import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { note } from "./note-entity";

export const notes: EntityPackageDefinition = defineEntityPackage({
  id: "note",
  entities: [note],
});

export default notes;

export {
  buildNoteAtprotoRecord,
  createNoteAtprotoProjection,
} from "./atproto-projection";

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
