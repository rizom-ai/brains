import {
  memoryActorReferenceSchema,
  memoryTimeRangeSchema,
  readMemoryPeople,
  writeMemoryPeople,
  type PeopleList,
} from "@brains/action-items";
import type { EntityMarkdownCodec } from "@brains/sdk/entities";
import { storedFormCodec } from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";

/**
 * A memory's next stored form (docs/plans/one-stored-form.md): its time
 * range as startedAt and endedAt, and its people indexed in the header as
 * actor refs, every header key an Obsidian property; each person stated
 * whole in a People section closing the body.
 */
const timeRangeHeaderShape = {
  startedAt: z.iso.datetime().optional().meta({ studioWidget: "provenance" }),
  endedAt: z.iso.datetime().optional().meta({ studioWidget: "provenance" }),
};

/** A list of people as metadata holds it; a summary's participants have roles. */
const memoryPeopleSchema = z
  .array(
    memoryActorReferenceSchema.extend({
      roles: z.array(z.string()).optional(),
    }),
  )
  .default([]);

/** A header in either form with its time range nested, as metadata holds it. */
function withNestedTimeRange(
  header: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const { startedAt, endedAt, ...rest } = header;
  return startedAt === undefined && endedAt === undefined
    ? rest
    : { ...rest, timeRange: { start: startedAt, end: endedAt } };
}

function peopleIndexShape(
  people: readonly PeopleList[],
): Record<string, z.ZodOptional<z.ZodArray<z.ZodString>>> {
  return Object.fromEntries(
    people.flatMap(({ key }) => [
      [key, z.array(z.string()).optional().meta({ studioWidget: "people" })],
      [
        `${key}Aliases`,
        z.array(z.string()).optional().meta({ studioWidget: "hidden" }),
      ],
    ]),
  );
}

/**
 * The codec of a memory whose metadata holds a time range and lists of
 * people: it reads either stored form and writes the one its store writes.
 * `body` is the body a write states, from the body a read handed back.
 */
export function memoryCodec<TSchema extends z.ZodObject>(options: {
  readonly schema: TSchema;
  readonly people: readonly PeopleList[];
  readonly body: (content: string) => string;
}): EntityMarkdownCodec<TSchema> {
  const { schema, people, body } = options;
  const peopleKeys = people.map(({ key }) => key);
  const indexKeys = new Set(
    peopleKeys.flatMap((key) => [key, `${key}Aliases`]),
  );
  const nextHeader = z.object({
    ...Object.fromEntries(
      Object.entries(schema.shape).filter(
        ([key]) => key !== "timeRange" && !indexKeys.has(key),
      ),
    ),
    ...timeRangeHeaderShape,
    ...peopleIndexShape(people),
  });
  return storedFormCodec<TSchema>({
    decode: ({ content, frontmatter }) => {
      const read = readMemoryPeople(
        content.replace(/^\n+/u, ""),
        frontmatter,
        people,
      );
      // The index is the header's, read into the people; a list the header
      // states as objects is the current form's and reads as it is.
      const header = Object.fromEntries(
        Object.entries(withNestedTimeRange(frontmatter)).filter(
          ([key]) =>
            !indexKeys.has(key) ||
            (peopleKeys.includes(key) && !Object.hasOwn(read.people, key)),
        ),
      );
      return {
        content: read.body,
        metadata: schema.parse({ ...header, ...read.people }),
      };
    },
    encode: {
      old: ({ content, metadata }) => ({
        content: body(content),
        frontmatter: schema.parse(metadata),
      }),
      new: ({ content, metadata }) => {
        const parsed: Record<string, unknown> = schema.parse(metadata);
        const { timeRange, ...rest } = parsed;
        const written = writeMemoryPeople(
          body(content),
          people,
          Object.fromEntries(
            peopleKeys.map((key) => [key, memoryPeopleSchema.parse(rest[key])]),
          ),
        );
        const range = memoryTimeRangeSchema.optional().parse(timeRange);
        // The time range and each list's index take the place of the keys
        // they replace.
        return {
          content: written.body,
          frontmatter: Object.fromEntries(
            Object.entries(parsed).flatMap(
              ([key, value]): [string, unknown][] => {
                if (key === "timeRange")
                  return range
                    ? [
                        ["startedAt", range.start],
                        ["endedAt", range.end],
                      ]
                    : [];
                if (peopleKeys.includes(key))
                  return [key, `${key}Aliases`].flatMap(
                    (indexKey): [string, unknown][] =>
                      Object.hasOwn(written.header, indexKey)
                        ? [[indexKey, written.header[indexKey]]]
                        : [],
                  );
                return indexKeys.has(key) ? [] : [[key, value]];
              },
            ),
          ),
        };
      },
    },
    header: { old: schema, new: nextHeader },
    // A list's aliases follow the list.
    places: [
      ["timeRange", "startedAt", "endedAt"],
      ...peopleKeys.map((key) => [key, `${key}Aliases`]),
    ],
  });
}
