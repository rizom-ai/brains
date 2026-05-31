import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { parseAtprotoLexicon } from "@brains/atproto-contracts";
import type {
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";
import { noteFrontmatterSchema, noteSchema } from "./schemas/note";
import noteLexicon from "../lexicons/ai.rizom.brain.note.json";

export interface NoteAtprotoRecord {
  [key: string]: unknown;
  $type: "ai.rizom.brain.note";
  title: string;
  body: string;
  format: "text/markdown";
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType: "base";
  sourceEntityId: string;
  createdAt: string;
  updatedAt?: string;
}

export async function buildNoteAtprotoRecord({
  entity,
  config,
}: AtprotoProjectionBuildInput): Promise<NoteAtprotoRecord> {
  const note = noteSchema.parse(entity);
  const parsed = parseMarkdownWithFrontmatter(
    note.content,
    noteFrontmatterSchema,
  );

  return {
    $type: "ai.rizom.brain.note",
    title: note.metadata.title,
    body: parsed.content,
    format: "text/markdown",
    ...(config.brainDid && { brainDid: config.brainDid }),
    ...(config.anchorDid && { anchorDid: config.anchorDid }),
    sourceEntityType: "base",
    sourceEntityId: note.id,
    createdAt: note.created,
    ...(note.updated && { updatedAt: note.updated }),
  };
}

export function createNoteAtprotoProjection(): AtprotoProjection<NoteAtprotoRecord> {
  return {
    entityType: "base",
    collection: "ai.rizom.brain.note",
    lexicon: parseAtprotoLexicon(noteLexicon),
    validate: false,
    buildRecord: buildNoteAtprotoRecord,
  };
}
