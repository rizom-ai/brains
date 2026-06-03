import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";
import type {
  AtprotoBrainNoteRecord,
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";
import { noteFrontmatterSchema, noteSchema } from "./schemas/note";

export async function buildNoteAtprotoRecord({
  entity,
  config,
}: AtprotoProjectionBuildInput): Promise<AtprotoBrainNoteRecord> {
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

export function createNoteAtprotoProjection(): AtprotoProjection<AtprotoBrainNoteRecord> {
  return {
    entityType: "base",
    collection: "ai.rizom.brain.note",
    lexicon: canonicalAtprotoLexicons["ai.rizom.brain.note"],
    validate: false,
    buildRecord: buildNoteAtprotoRecord,
  };
}
