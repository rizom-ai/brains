import type { StoredSource } from "@brains/content-formatters";
import {
  defineDataSource,
  type EntityDataSourceDefinition,
  type EntityDefinition,
  type EntityOf,
} from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";
import { readSeminar } from "../lib/seminar-body";
import {
  CHAIR,
  seminarFrontmatterSchema,
  seminarRoundSchema,
  type seminarMetadataSchema,
  type SeminarTurn,
} from "../schemas/seminar";

type SeminarDefinition = EntityDefinition<
  "seminar",
  typeof seminarMetadataSchema
>;

/*
 * A seminar as its pages read it. Page data is plain JSON, so what a stored
 * turn leaves out is stated here: null for what it does not have, and an
 * empty list for whom it addresses or what it cites.
 */

type PageSourceSchema = z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  url: z.ZodNullable<z.ZodString>;
}>;

/** A source as a page links it: its title, and its address when it has one. */
export const seminarPageSourceSchema: PageSourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().nullable(),
});

type PageTurnSchema = z.ZodObject<{
  round: typeof seminarRoundSchema;
  speaker: z.ZodString;
  name: z.ZodString;
  chair: z.ZodBoolean;
  to: z.ZodArray<z.ZodString>;
  text: z.ZodNullable<z.ZodString>;
  failed: z.ZodNullable<z.ZodString>;
  sources: z.ZodArray<PageSourceSchema>;
}>;

/** A turn as a page shows it: what was said, or why nothing was. */
export const seminarPageTurnSchema: PageTurnSchema = z.object({
  round: seminarRoundSchema,
  speaker: z.string(),
  name: z.string(),
  /** Whether the chair took the turn, not a peer. */
  chair: z.boolean(),
  to: z.array(z.string()),
  text: z.string().nullable(),
  failed: z.string().nullable(),
  sources: z.array(seminarPageSourceSchema),
});

export type SeminarPageTurn = z.output<typeof seminarPageTurnSchema>;

type PageClosingSchema = z.ZodObject<{
  text: z.ZodString;
  sources: z.ZodArray<PageSourceSchema>;
}>;

type SeminarPageSchema = z.ZodObject<
  {
    id: z.ZodString;
    speakers: z.ZodArray<z.ZodString>;
    turns: z.ZodArray<PageTurnSchema>;
    closing: z.ZodNullable<PageClosingSchema>;
  } & (typeof seminarFrontmatterSchema)["shape"]
>;

/**
 * A seminar as its pages read it: its fields, the peers it was held with,
 * every turn in the order taken, and where they meet.
 */
export const seminarPageSchema: SeminarPageSchema = z.object({
  id: z.string(),
  ...seminarFrontmatterSchema.shape,
  /** The peers the question was put to, by name, in the order of their openings. */
  speakers: z.array(z.string()),
  turns: z.array(seminarPageTurnSchema),
  closing: z
    .object({ text: z.string(), sources: z.array(seminarPageSourceSchema) })
    .nullable(),
});

export type SeminarPage = z.output<typeof seminarPageSchema>;

/** The list page: the seminars, newest first. */
export const seminarListPageSchema: z.ZodObject<{
  seminars: z.ZodArray<SeminarPageSchema>;
}> = z.object({ seminars: z.array(seminarPageSchema) });

export type SeminarListPage = z.output<typeof seminarListPageSchema>;

/** One seminar's page, with the seminars held after and before it. */
export const seminarDetailPageSchema: z.ZodObject<{
  seminar: SeminarPageSchema;
  prevSeminar: z.ZodNullable<SeminarPageSchema>;
  nextSeminar: z.ZodNullable<SeminarPageSchema>;
}> = z.object({
  seminar: seminarPageSchema,
  prevSeminar: seminarPageSchema.nullable(),
  nextSeminar: seminarPageSchema.nullable(),
});

export type SeminarDetailPage = z.output<typeof seminarDetailPageSchema>;

function pageSources(
  sources: readonly StoredSource[] | undefined,
): SeminarPageTurn["sources"] {
  return (sources ?? []).map(({ id, title, url }) => ({
    id,
    title,
    url: url ?? null,
  }));
}

function pageTurn(turn: SeminarTurn): SeminarPageTurn {
  return {
    round: turn.round,
    speaker: turn.speaker,
    name: turn.name,
    chair: turn.speaker === CHAIR,
    to: turn.to ?? [],
    text: turn.text ?? null,
    failed: turn.failed ?? null,
    sources: pageSources(turn.sources),
  };
}

function seminarPage(entity: EntityOf<SeminarDefinition>): SeminarPage {
  const { frontmatter, turns, closing } = readSeminar(entity);
  return {
    id: entity.id,
    ...frontmatter,
    speakers: turns
      .filter(({ round, speaker }) => round === "opening" && speaker !== CHAIR)
      .map(({ name }) => name),
    turns: turns.map(pageTurn),
    closing: closing
      ? { text: closing.text, sources: pageSources(closing.sources) }
      : null,
  };
}

/**
 * The seminars' pages: every seminar, newest asked first, or one by its id
 * with its neighbors, served as seminar:entities.
 */
export function seminarDataSource(
  seminar: SeminarDefinition,
): EntityDataSourceDefinition<SeminarDefinition, SeminarPage, SeminarListPage> {
  return defineDataSource({
    id: "entities",
    name: "Seminar DataSource",
    description: "Fetches seminars and their turns for reading",
    entity: seminar,
    defaultSort: [{ field: "asked", direction: "desc" }],
    defaultLimit: 1000,
    lookupField: "id",
    enableNavigation: true,
    transform: seminarPage,
    list: (items): SeminarListPage => ({ seminars: [...items] }),
    detail: ({ item, navigation }): SeminarDetailPage => ({
      seminar: item,
      prevSeminar: navigation?.prev ?? null,
      nextSeminar: navigation?.next ?? null,
    }),
  });
}
