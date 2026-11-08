import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import {
  atprotoProvenance,
  defineAtprotoProjection,
} from "@brains/atproto-contracts";
import type {
  AtprotoBrainNoteRecord,
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";
import { noteFrontmatterSchema, noteSchema } from "./schemas/note";

export async function buildNoteAtprotoRecord({
  entity,
  config,
  pageUrl,
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
    ...atprotoProvenance({ config, pageUrl }, note),
  };
}

export function createNoteAtprotoProjection(): AtprotoProjection<AtprotoBrainNoteRecord> {
  return defineAtprotoProjection({
    entityType: "note",
    collection: "ai.rizom.brain.note",
    buildRecord: buildNoteAtprotoRecord,
  });
}
