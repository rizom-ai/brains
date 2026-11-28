import { parseMarkdownWithFrontmatter } from "@brains/sdk/internal/entity-runtime";
import type { ServiceDataSourceDeclaration } from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";
import { firstSentence } from "../templates/seminar-design";

/*
 * The brain's own notes as its site reads them. The note type has no pages
 * of its own: a brain that holds seminars shows its notes beside them, so
 * the pages and what they read come with the seminars.
 */

const NOTE_ENTITY_TYPE = "note";

type NotePageSchema = z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  body: z.ZodString;
}>;

const notePageSchema: NotePageSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
});

/** A note as its page reads it. */
export type NotePage = z.output<typeof notePageSchema>;

export const noteDetailPageSchema: z.ZodObject<{ note: NotePageSchema }> =
  z.object({ note: notePageSchema });

export type NoteDetailPage = z.output<typeof noteDetailPageSchema>;

type NoteEntrySchema = z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  opening: z.ZodString;
}>;

const noteEntrySchema: NoteEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  opening: z.string(),
});

export const noteListPageSchema: z.ZodObject<{
  notes: z.ZodArray<NoteEntrySchema>;
}> = z.object({ notes: z.array(noteEntrySchema) });

export type NoteListPage = z.output<typeof noteListPageSchema>;

/** A stored note, as far as its pages read it. */
interface StoredNote {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
}

const titled = z.object({ title: z.string().min(1) });

/** A note's page: its title and its body, without the header. */
export function notePage(note: StoredNote): NotePage {
  const title = titled.safeParse(note.metadata);
  const { content } = parseMarkdownWithFrontmatter(
    note.content,
    z.record(z.string(), z.unknown()),
  );
  return {
    id: note.id,
    title: title.success ? title.data.title : note.id,
    body: content.trim(),
  };
}

/** A note's first paragraph of text: no heading, quote or list. */
function firstParagraph(body: string): string {
  return (
    body
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .find((block) => block !== "" && !/^(#|>|[-*] |\d+\. )/.test(block)) ?? ""
  );
}

/** A paragraph as plain words: its emphasis and links unmarked. */
function plain(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The notes' index: every note by title, each with its opening sentence. */
export function noteListPage(notes: readonly StoredNote[]): NoteListPage {
  return {
    notes: notes
      .map(notePage)
      .map(({ id, title, body }) => ({
        id,
        title,
        opening: firstSentence(plain(firstParagraph(body))),
      }))
      .sort((left, right) => left.title.localeCompare(right.title)),
  };
}

const notesQuerySchema = z.object({
  query: z.object({ id: z.string().min(1).optional() }).optional(),
});

/** The brain's notes, as their pages read them from it. */
export interface NoteReads {
  listEntities(request: { entityType: string }): Promise<StoredNote[]>;
  getEntity(request: {
    entityType: string;
    id: string;
  }): Promise<StoredNote | null>;
}

/** What a page asks of the notes: all of them, or the one its query names. */
export async function readNotes(
  reads: NoteReads,
  query: unknown,
): Promise<NoteListPage | NoteDetailPage> {
  const id = notesQuerySchema.parse(query).query?.id;
  if (id === undefined) {
    return noteListPage(
      await reads.listEntities({ entityType: NOTE_ENTITY_TYPE }),
    );
  }
  const note = await reads.getEntity({ entityType: NOTE_ENTITY_TYPE, id });
  if (!note) throw new Error(`No note ${id}`);
  return { note: notePage(note) };
}

/** The notes' source as the brain registers it: `seminar:notes`. */
export function seminarNotesDataSource(): ServiceDataSourceDeclaration {
  return {
    id: "notes",
    name: "Seminar Notes DataSource",
    description: "The brain's own notes: all of them, or one by its id",
    fetch: (query, { corpus }): Promise<NoteListPage | NoteDetailPage> =>
      readNotes(corpus, query),
  };
}
