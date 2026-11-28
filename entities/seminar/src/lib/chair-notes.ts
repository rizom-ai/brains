import { parseMarkdownWithFrontmatter } from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";
import type { ChairNote } from "./chair";

/** The entity type the chair reads as its notes. */
export const NOTE_ENTITY_TYPE = "note";

/** How many notes the chair reads for one question. */
export const CHAIR_NOTE_LIMIT = 3;

const titled = z.object({ title: z.string().min(1) });

/** A stored note as the chair reads it: its title and its body, without the header. */
export function chairNoteOf(note: {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
}): ChairNote {
  const title = titled.safeParse(note.metadata);
  const { content } = parseMarkdownWithFrontmatter(
    note.content,
    z.record(z.string(), z.unknown()),
  );
  return {
    title: title.success ? title.data.title : note.id,
    text: content.trim(),
  };
}
